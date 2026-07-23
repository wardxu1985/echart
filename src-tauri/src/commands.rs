use tauri::{AppHandle, State};
use crate::state::{AppState, ChartData, ColumnInfo, ColumnType, FileOpenResult, SeriesData, TimeRange};
use crate::excel_reader::read_excel;
use crate::downsample::{lttb_downsample, detect_gaps};

const DOWNSAMPLE_TARGET: usize = 5000;
const MAX_SERIES: usize = 20;

#[tauri::command]
pub fn open_file(
    path: String,
    _inherit_from: Option<String>,
    _app: AppHandle,
    state: State<'_, AppState>,
) -> Result<FileOpenResult, String> {
    if path.len() > 500 {
        return Err("文件路径过长".to_string());
    }

    // 检查文件大小（简单估算）
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > 500 * 1024 * 1024 {
            return Err("文件超过 500MB 限制".to_string());
        }
    }

    let (data, columns, row_count) = read_excel(&path)?;

    if data.is_empty() {
        return Err("文件中未找到有效数值列".to_string());
    }

    let window_id = uuid::Uuid::new_v4().to_string();

    let window_state = crate::state::WindowState {
        raw_data: data,
        columns: columns.clone(),
    };

    // 插入到全局状态
    let mut windows = state.windows.lock().map_err(|e| e.to_string())?;
    windows.insert(window_id.clone(), window_state);

    // 计算时间范围
    let time_range = calculate_time_range(&columns);

    Ok(FileOpenResult {
        columns,
        time_range,
        row_count,
        window_id,
    })
}

#[tauri::command]
pub fn get_series(
    window_id: String,
    columns: Vec<String>,
    time_start: Option<f64>,
    time_end: Option<f64>,
    state: State<'_, AppState>,
) -> Result<ChartData, String> {
    if columns.is_empty() {
        return Err("请至少选择 1 个信号".to_string());
    }

    if columns.len() > MAX_SERIES {
        return Err(format!("最多选择 {} 个信号，当前选择了 {}", MAX_SERIES, columns.len()));
    }

    // 快速获取数据后释放锁，避免阻塞其他窗口
    let (timestamps, data_snapshot) = {
        let windows = state.windows.lock().map_err(|e| e.to_string())?;
        let window = windows.get(&window_id)
            .ok_or_else(|| format!("窗口 {} 不存在", window_id))?;

        // 检查所有列是否存在
        for col in &columns {
            if !window.raw_data.contains_key(col) {
                return Err(format!("信号 \"{}\" 在数据中不存在", col));
            }
        }

        // 找到时间列（第一个 Time 类型列）
        let time_col = window.columns.iter()
            .find(|c| c.col_type == ColumnType::Time)
            .map(|c| c.name.as_str())
            .unwrap_or_else(|| {
                window.columns.iter()
                    .find(|c| c.col_type == ColumnType::Numeric)
                    .map(|c| c.name.as_str())
                    .unwrap_or("")
            });

        if time_col.is_empty() {
            return Err("未找到可用时间列".to_string());
        }

        let ts = window.raw_data.get(time_col)
            .ok_or_else(|| "时间列数据缺失".to_string())?
            .clone();

        (ts, window.raw_data.clone())
    };
    // 锁已释放，后续处理不阻塞其他窗口

    // 过滤时间范围
    let range_indices: Vec<usize> = timestamps.iter().enumerate()
        .filter(|(_, &t)| {
            let after_start = time_start.map_or(true, |s| t >= s);
            let before_end = time_end.map_or(true, |e| t <= e);
            after_start && before_end
        })
        .map(|(i, _)| i)
        .collect();

    if range_indices.is_empty() {
        return Err("所选时间区间内无数据".to_string());
    }

    // 提取时间子集
    let filtered_x: Vec<f64> = range_indices.iter().map(|&i| timestamps[i]).collect();

    // 检测断点
    let gaps = detect_gaps(&filtered_x, 3.0);

    // 降采样时间轴
    let (_, sampled_x, _) = lttb_downsample(&filtered_x, &filtered_x, DOWNSAMPLE_TARGET);

    // 对每个选中的列降采样
    let mut series_list = Vec::new();

    for col_name in &columns {
        if let Some(values) = data_snapshot.get(col_name) {
            let filtered_y: Vec<f64> = range_indices.iter()
                .map(|&i| values.get(i).copied().unwrap_or(f64::NAN))
                .collect();

            // 添加断点位置的 NaN
            let y_with_gaps: Vec<f64> = filtered_y.iter().enumerate()
                .map(|(i, &v)| if gaps[i] { f64::NAN } else { v })
                .collect();

            // LTTB 降采样
            let (_, _, sampled_y) = lttb_downsample(&filtered_x, &y_with_gaps, DOWNSAMPLE_TARGET);

            // 转为 Option<f64>（NaN → None）
            let y_optional: Vec<Option<f64>> = sampled_y.iter()
                .map(|&v| if v.is_nan() { None } else { Some(v) })
                .collect();

            series_list.push(SeriesData {
                name: col_name.clone(),
                y: y_optional,
            });
        }
    }

    // 时间戳转为 ISO 字符串
    let x_strings: Vec<String> = sampled_x.iter()
        .map(|&ts| {
            let secs = ts as i64;
            let nanos = ((ts - secs as f64) * 1_000_000_000.0) as u32;
            if let Some(dt) = chrono_precise(secs, nanos) {
                dt
            } else {
                ts.to_string()
            }
        })
        .collect();

    Ok(ChartData {
        x: x_strings,
        series: series_list,
    })
}

#[tauri::command]
pub fn close_window(
    window_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut windows = state.windows.lock().map_err(|e| e.to_string())?;
    windows.remove(&window_id);
    Ok(())
}

#[tauri::command]
pub fn create_window(
    app: AppHandle,
    url: String,
    title: String,
    width: u32,
    height: u32,
) -> Result<(), String> {
    use tauri::WebviewWindowBuilder;

    let window_id = uuid::Uuid::new_v4().to_string();
    let builder = WebviewWindowBuilder::new(&app, &window_id, tauri::WebviewUrl::App(url.into()))
        .title(&title)
        .inner_size(width as f64, height as f64)
        .resizable(true);

    builder.build().map_err(|e| format!("创建窗口失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn pick_file(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file = app.dialog()
        .file()
        .add_filter("Excel", &["xlsx", "xls"])
        .blocking_pick_file();
    Ok(file.map(|f| f.to_string()))
}

/// 计算时间范围
fn calculate_time_range(columns: &[ColumnInfo]) -> TimeRange {
    for col in columns {
        if col.col_type == ColumnType::Time {
            return TimeRange {
                start: col.min,
                end: col.max,
            };
        }
    }
    TimeRange {
        start: 0.0,
        end: 0.0,
    }
}

/// Unix 时间戳转 ISO 字符串（使用 chrono）
fn chrono_precise(secs: i64, nanos: u32) -> Option<String> {
    let dt = chrono::DateTime::from_timestamp(secs, nanos)?;
    Some(dt.format("%Y-%m-%d %H:%M:%S%.3f").to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_time_range() {
        let cols = vec![
            ColumnInfo {
                name: "event_time".into(),
                col_type: ColumnType::Time,
                min: 1000.0,
                max: 2000.0,
                sample_count: 100,
            },
        ];
        let range = calculate_time_range(&cols);
        assert_eq!(range.start, 1000.0);
        assert_eq!(range.end, 2000.0);
    }

    #[test]
    fn test_chrono_precise() {
        // 2024-01-01 00:00:00 UTC
        let result = chrono_precise(1704067200, 0);
        assert!(result.is_some());
        assert_eq!(result.unwrap(), "2024-01-01 00:00:00.000");
    }
}
