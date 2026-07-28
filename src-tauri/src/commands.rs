use std::collections::HashMap;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use crate::state::{AppState, ChartData, ColumnInfo, ColumnType, FileOpenResult, PendingFileData, SeriesData, TimeRange};
use crate::excel_reader::read_excel;
use crate::csv_reader::read_csv;
use crate::downsample::detect_gaps;

const MAX_SERIES: usize = 20;

#[tauri::command]
pub async fn open_file(
    path: String,
    _inherit_from: Option<String>,
    app: AppHandle,
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

    let app_for_blocking = app.clone();
    let path_for_blocking = path.clone();

    // 将重型文件 IO 放到独立阻塞线程，避免卡死主线程和前端
    let (data, columns, row_count, vin) = tauri::async_runtime::spawn_blocking(move || {
        let _ = app_for_blocking.emit("loading-progress", ProgressPayload { percent: 10, message: "正在读取文件…" });

        let result = if path_for_blocking.to_lowercase().ends_with(".csv") {
            read_csv(&path_for_blocking)
        } else {
            read_excel(&path_for_blocking)
        };

        let _ = app_for_blocking.emit("loading-progress", ProgressPayload { percent: 85, message: "加载完成" });

        result
    }).await.map_err(|e| format!("文件读取线程异常: {}", e))??;

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
        vin,
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

    // 快速提取所需列后释放锁，避免阻塞其他窗口
    // 不再克隆整个 raw_data，仅提取时间列 + 请求的信号列
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

        // 仅提取需要的列（时间列 + 请求的信号列）
        let mut snapshot: HashMap<String, Vec<f64>> = HashMap::with_capacity(columns.len() + 1);
        // 插入时间列
        snapshot.insert(time_col.to_string(), ts.clone());
        // 插入请求的信号列（跳过时间列本身，避免重复插入）
        for col_name in &columns {
            if col_name != time_col {
                if let Some(values) = window.raw_data.get(col_name) {
                    snapshot.insert(col_name.clone(), values.clone());
                }
            }
        }

        (ts, snapshot)
    };
    // 锁已释放，后续处理不阻塞其他窗口

    // 确保时间升序排列（Excel 数据可能倒序，导致断点检测出错）
    let mut order: Vec<usize> = (0..timestamps.len()).collect();
    order.sort_by(|&a, &b| timestamps[a].partial_cmp(&timestamps[b]).unwrap_or(std::cmp::Ordering::Equal));
    let timestamps: Vec<f64> = order.iter().map(|&i| timestamps[i]).collect();
    let data_snapshot: HashMap<String, Vec<f64>> = data_snapshot.into_iter()
        .map(|(k, v)| {
            let sorted: Vec<f64> = order.iter().map(|&i| v[i]).collect();
            (k, sorted)
        })
        .collect();

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

    // 全量返回，不做降采样
    let mut series_list = Vec::new();

    for col_name in &columns {
        if let Some(values) = data_snapshot.get(col_name) {
            let y_values: Vec<Option<f64>> = range_indices.iter().enumerate()
                .map(|(i, &idx)| {
                    if gaps[i] {
                        None // 断点位置插入 null
                    } else {
                        let v = values.get(idx).copied().unwrap_or(f64::NAN);
                        if v.is_finite() { Some(v) } else { None }
                    }
                })
                .collect();

            series_list.push(SeriesData {
                name: col_name.clone(),
                y: y_values,
            });
        }
    }

    // 时间戳转为 ISO 字符串
    let x_strings: Vec<String> = filtered_x.iter()
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
    file_path: Option<String>,
    inherit_from: Option<String>,
    inherit_columns: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    use tauri::WebviewWindowBuilder;

    let _ = url; // 保留参数向前兼容，但不再拼接查询参数到 URL
    let window_id = uuid::Uuid::new_v4().to_string();

    // 不传 URL 查询参数（Windows WebView2 无法正确加载带参数的 App URL）
    let webview_url = tauri::WebviewUrl::App(std::path::PathBuf::from("index.html"));

    // 双通道存储待加载文件：Mutex + 文件系统（Windows Mutex 跨 WebView 可能不可靠）
    if let Some(ref path) = file_path {
        let pending = PendingFileData {
            path: path.clone(),
            inherit_from,
            inherit_columns,
        };
        // 通道 1: Mutex（主通道，跨窗口共享）
        if let Ok(mut guard) = state.pending_file.lock() {
            *guard = Some(pending.clone());
        }
        // 通道 2: 文件系统（Windows 回退）
        if let Ok(data_dir) = app.path().app_data_dir() {
            if std::fs::create_dir_all(&data_dir).is_ok() {
                let info_path = data_dir.join("pending_window.json");
                if let Ok(json) = serde_json::to_string(&pending) {
                    let _ = std::fs::write(&info_path, &json);
                }
            }
        }
    }

    let builder = WebviewWindowBuilder::new(&app, &window_id, webview_url)
        .title(&title)
        .inner_size(width as f64, height as f64)
        .resizable(true);

    builder.build().map_err(|e| format!("创建窗口失败: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn get_pending_file(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<PendingFileData>, String> {
    // 通道 1: Mutex
    {
        let mut pending = state.pending_file.lock().map_err(|e| e.to_string())?;
        if pending.is_some() {
            return Ok(pending.take());
        }
    }
    // 通道 2: 文件系统回退（Windows WebView2 兼容）
    if let Ok(data_dir) = app.path().app_data_dir() {
        let info_path = data_dir.join("pending_window.json");
        if info_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&info_path) {
                let _ = std::fs::remove_file(&info_path);
                if let Ok(pending) = serde_json::from_str(&content) {
                    return Ok(Some(pending));
                }
            }
        }
    }
    Ok(None)
}

#[tauri::command]
pub async fn pick_file(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file = app.dialog()
        .file()
        .add_filter("信号文件", &["xlsx", "xls", "csv"])
        .blocking_pick_file();
    Ok(file.map(|f| f.to_string()))
}

#[tauri::command]
pub fn get_version() -> String {
    format!("v{} · wardxu", env!("CARGO_PKG_VERSION"))
}

#[tauri::command]
pub fn log_error(message: String) {
    // 将前端错误同步打印到 Rust 控制台（Windows 上运行 exe 可见）
    eprintln!("[JS Error] {}", message);
}

#[tauri::command]
pub fn compute_signal(
    window_id: String,
    signal_a: String,
    signal_b: String,
    operation: String,
    result_name: String,
    state: State<'_, AppState>,
) -> Result<ColumnInfo, String> {
    if result_name.len() > 100 {
        return Err("结果名称过长".to_string());
    }
    if result_name.trim().is_empty() {
        return Err("请输入结果名称".to_string());
    }
    if operation != "+" && operation != "-" {
        return Err("不支持的运算，仅支持 + 和 -".to_string());
    }

    let mut windows = state.windows.lock().map_err(|e| e.to_string())?;
    let window = windows.get_mut(&window_id)
        .ok_or_else(|| format!("窗口 {} 不存在", window_id))?;

    let data_a = window.raw_data.get(&signal_a)
        .ok_or_else(|| format!("信号 \"{}\" 不存在", signal_a))?;
    let data_b = window.raw_data.get(&signal_b)
        .ok_or_else(|| format!("信号 \"{}\" 不存在", signal_b))?;

    if data_a.len() != data_b.len() {
        return Err("两个信号数据长度不一致".to_string());
    }

    if window.raw_data.contains_key(&result_name) {
        return Err(format!("信号名 \"{}\" 已存在", result_name));
    }

    // 逐元素运算
    let result: Vec<f64> = data_a.iter().zip(data_b.iter()).map(|(&a, &b)| match operation.as_str() {
        "+" => a + b,
        "-" => a - b,
        _ => f64::NAN,
    }).collect();

    let valid: Vec<&f64> = result.iter().filter(|v| v.is_finite()).collect();
    if valid.is_empty() {
        return Err("运算结果全部无效".to_string());
    }

    let min = valid.iter().fold(f64::INFINITY, |a, &&b| a.min(b));
    let max = valid.iter().fold(f64::NEG_INFINITY, |a, &&b| a.max(b));

    let col_info = ColumnInfo {
        name: result_name.clone(),
        col_type: ColumnType::Numeric,
        min,
        max,
        sample_count: valid.len(),
    };

    window.raw_data.insert(result_name, result);
    window.columns.push(col_info.clone());

    Ok(col_info)
}

/// 加载进度事件载荷
#[derive(Clone, Serialize)]
struct ProgressPayload {
    percent: u32,
    message: &'static str,
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
    Some(dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string())
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
        assert_eq!(result.unwrap(), "2024-01-01T00:00:00.000Z");
    }
}
