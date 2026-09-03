use std::collections::HashMap;
use crate::state::{ColumnInfo, ColumnType};

/// 常见时间关键词
const TIME_KEYWORDS: &[&str] = &["time", "event", "日期", "时间"];

pub fn has_time_keyword(name: &str) -> bool {
    let lower = name.to_lowercase();
    TIME_KEYWORDS.iter().any(|kw| lower.contains(kw))
}

/// 解析可能带后缀单位的数值（"100V" → 100.0, "10.5kW" → 10.5）
pub fn parse_numeric_with_unit(s: &str) -> Option<f64> {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return None;
    }
    // 先尝试直接解析
    if let Ok(n) = trimmed.parse::<f64>() {
        return Some(n);
    }
    // 提取前导数字部分（含小数点）
    let num_part: String = trimmed.chars().take_while(|c| c.is_ascii_digit() || *c == '.' || *c == '-').collect();
    if num_part.is_empty() || num_part == "." || num_part == "-" {
        return None;
    }
    num_part.parse::<f64>().ok()
}

/// 尝试解析时间字符串为 Unix 时间戳
pub fn parse_timestamp_string(s: &str) -> Option<f64> {
    let trimmed = s.trim();

    // 先尝试数值解析（可能是 Excel 序列号或 Unix 时间戳）
    if let Some(num) = parse_numeric_with_unit(trimmed) {
        if num > 1e9 && num < 2e9 {
            return Some(num); // 已经是 Unix 时间戳
        }
        if num > 40000.0 && num < 200000.0 {
            // Excel 序列号 → UTC 时间戳（序列号基于本地时间，需减时区偏移）
            let utc_ts = (num - 25569.0) * 86400.0;
            let local_offset_secs = chrono::Local::now().offset().local_minus_utc() as f64;
            return Some(utc_ts - local_offset_secs);
        }
        return Some(num);
    }

    // 尝试日期时间字符串解析
    // 注意：Excel/CSV 中的日期时间字符串通常是本地时间（如北京时间），
    // 需要用本地时区偏移量转为 UTC 时间戳，否则前端显示会差 8 小时
    let naive_to_timestamp = |dt: chrono::NaiveDateTime| -> f64 {
        let local_offset = *chrono::Local::now().offset();
        if let Some(local_dt) = dt.and_local_timezone(local_offset).single() {
            return local_dt.timestamp() as f64;
        }
        // fallback: 当作 UTC 处理
        dt.and_utc().timestamp() as f64
    };

    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S%.f") {
        return Some(naive_to_timestamp(dt));
    }
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S") {
        return Some(naive_to_timestamp(dt));
    }

    None
}

/// 统一的列解析：接收表头 + 逐列原始字符串，返回 data + columns
///
/// raw_cols[i] 对应 header[i] 的所有行字符串值。
/// 流程：
///  1. 空列名 → Skip
///  2. 含时间关键词 → 尝试时间解析；成功 → Time 列
///  3. 数值检查（valid_ratio ≥ 50%）→ Numeric / Skip
pub fn parse_columns(
    header: &[String],
    raw_cols: &[Vec<String>],
) -> (HashMap<String, Vec<f64>>, Vec<ColumnInfo>) {
    let mut data: HashMap<String, Vec<f64>> = HashMap::new();
    let mut columns: Vec<ColumnInfo> = Vec::new();

    for (i, name) in header.iter().enumerate() {
        if name.trim().is_empty() {
            columns.push(ColumnInfo {
                name: name.clone(),
                col_type: ColumnType::Skip,
                min: 0.0,
                max: 0.0,
                sample_count: 0,
            });
            continue;
        }

        let values = &raw_cols[i];

        // 时间关键词优先
        if has_time_keyword(name) {
            let ts_values: Vec<f64> = values.iter()
                .map(|v| parse_timestamp_string(v).unwrap_or(f64::NAN))
                .collect();

            let valid_count = ts_values.iter().filter(|v| v.is_finite()).count();
            // 空单元格不计入分母：稀疏采集的信号（仅在事件窗口内有值）不应被丢弃
            let nonempty_count = values.iter().filter(|v| !v.trim().is_empty()).count();
            let has_data = nonempty_count > 0 && valid_count as f64 / nonempty_count as f64 >= 0.5;

            if has_data {
                let min = ts_values.iter().cloned()
                    .filter(|v| v.is_finite())
                    .fold(f64::INFINITY, f64::min);
                let max = ts_values.iter().cloned()
                    .filter(|v| v.is_finite())
                    .fold(f64::NEG_INFINITY, f64::max);
                data.insert(name.clone(), ts_values);
                columns.push(ColumnInfo {
                    name: name.clone(),
                    col_type: ColumnType::Time,
                    min,
                    max,
                    sample_count: valid_count,
                });
                continue;
            }
            // 解析失败，回退到数值判断逻辑
        }

        // 尝试解析为数值
        let numeric: Vec<Option<f64>> = values.iter()
            .map(|v| parse_numeric_with_unit(v.trim()))
            .collect();

        let valid_count = numeric.iter().filter(|v| v.is_some()).count();
        // 空单元格不计入分母：稀疏采集的信号（如仅在制动/事件期间采样的列）不应被丢弃
        let nonempty_count = values.iter().filter(|v| !v.trim().is_empty()).count();
        let valid_ratio = if nonempty_count == 0 { 0.0 } else { valid_count as f64 / nonempty_count as f64 };

        if valid_ratio < 0.5 {
            columns.push(ColumnInfo {
                name: name.clone(),
                col_type: ColumnType::Skip,
                min: 0.0,
                max: 0.0,
                sample_count: 0,
            });
            continue;
        }

        let parsed: Vec<f64> = numeric.iter().map(|v| v.unwrap_or(f64::NAN)).collect();
        let min = parsed.iter().cloned().filter(|v| !v.is_nan()).fold(f64::INFINITY, f64::min);
        let max = parsed.iter().cloned().filter(|v| !v.is_nan()).fold(f64::NEG_INFINITY, f64::max);

        data.insert(name.clone(), parsed);

        columns.push(ColumnInfo {
            name: name.clone(),
            col_type: ColumnType::Numeric,
            min: if min.is_finite() { min } else { 0.0 },
            max: if max.is_finite() { max } else { 0.0 },
            sample_count: valid_count,
        });
    }

    (data, columns)
}

/// 检测逗号分隔的组数据列（如"单体电池电压-1"）
/// 条件：> 50% 的非空值包含逗号，且逗号分隔的各部分均为数字
pub fn find_grouped_columns(
    header: &[String],
    raw_cols: &[Vec<String>],
) -> Vec<(String, Vec<String>, usize)> {
    let mut result = Vec::new();

    for (i, name) in header.iter().enumerate() {
        if name.trim().is_empty() {
            continue;
        }
        let values = &raw_cols[i];
        if values.is_empty() {
            continue;
        }

        // 检查是否包含逗号
        let comma_count = values.iter().filter(|v| v.contains(',')).count();
        if comma_count as f64 / (values.len() as f64) < 0.5 {
            continue;
        }

        // 取第一行统计元素个数
        let first = values.iter().find(|v| v.contains(','));
        if let Some(first_val) = first {
            let parts: Vec<&str> = first_val.split(',').collect();
            let element_count = parts.len();

            // 检查所有逗号分隔部分的格式
            let all_numeric = parts.iter().all(|p| {
                let trimmed = p.trim().trim_end_matches(|c: char| !c.is_ascii_digit() && c != '.');
                trimmed.parse::<f64>().is_ok()
            });

            if all_numeric && element_count > 1 {
                result.push((name.clone(), values.clone(), element_count));
            }
        }
    }

    result
}

/// 扫描表头和原始数据，查找车架号/VIN 列并返回第一个有效值
const VIN_KEYWORDS: &[&str] = &["vin", "车架号", "底盘号", "底盘", "车辆识别"];

pub fn find_vin(header: &[String], raw_cols: &[Vec<String>]) -> Option<String> {
    for (i, name) in header.iter().enumerate() {
        let lower = name.to_lowercase();
        if VIN_KEYWORDS.iter().any(|kw| lower.contains(kw)) {
            // 找到第一个非空值
            if let Some(values) = raw_cols.get(i) {
                for v in values {
                    let trimmed = v.trim();
                    if !trimmed.is_empty() {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_has_time_keyword() {
        assert!(has_time_keyword("event_time"));
        assert!(has_time_keyword("Timestamp"));
        assert!(has_time_keyword("日期"));
        assert!(!has_time_keyword("speed"));
        assert!(!has_time_keyword("voltage"));
    }

    #[test]
    fn test_parse_numeric_with_unit() {
        assert_eq!(parse_numeric_with_unit("100"), Some(100.0));
        assert_eq!(parse_numeric_with_unit("100V"), Some(100.0));
        assert_eq!(parse_numeric_with_unit("10.5kW"), Some(10.5));
        assert_eq!(parse_numeric_with_unit("-25.3"), Some(-25.3));
        assert_eq!(parse_numeric_with_unit(""), None);
        assert_eq!(parse_numeric_with_unit("abc"), None);
    }

    #[test]
    fn test_parse_timestamp_string_unix() {
        // Unix timestamp
        let result = parse_timestamp_string("1704067200");
        assert_eq!(result, Some(1704067200.0));
    }

    #[test]
    fn test_parse_timestamp_string_datetime() {
        let result = parse_timestamp_string("2024-01-01 00:00:00");
        assert!(result.is_some());
    }

    #[test]
    fn test_parse_columns_basic() {
        let header = vec!["time".into(), "speed".into(), "voltage".into()];
        let raw = vec![
            vec!["0".into(), "1".into(), "2".into()],
            vec!["10".into(), "20".into(), "30".into()],
            vec!["15".into(), "25".into(), "35".into()],
        ];
        let (data, cols) = parse_columns(&header, &raw);
        assert_eq!(cols.len(), 3);
        assert_eq!(cols[0].col_type, ColumnType::Time);
        assert_eq!(cols[1].col_type, ColumnType::Numeric);
        assert_eq!(cols[2].col_type, ColumnType::Numeric);
        assert_eq!(data.len(), 3);
    }

    #[test]
    fn test_parse_columns_skip_empty_and_non_numeric() {
        let header = vec!["".into(), "notes".into(), "value".into()];
        let raw: Vec<Vec<String>> = vec![
            vec!["x".into(), "y".into()],
            vec!["hello".into(), "world".into()],
            vec!["10".into(), "20".into()],
        ];
        let (_data, cols) = parse_columns(&header, &raw);
        assert_eq!(cols[0].col_type, ColumnType::Skip);
        assert_eq!(cols[1].col_type, ColumnType::Skip);
        assert_eq!(cols[2].col_type, ColumnType::Numeric);
    }

    #[test]
    fn test_find_grouped_columns_identifies_comma_separated() {
        let header = vec!["采集时间".into(), "单体电池电压-1".into()];
        let raw = vec![
            vec!["2026-07-22 20:59:10".into(), "2026-07-22 20:59:00".into()],
            vec![
                "3.654,3.655,3.656".into(),
                "3.651,3.652,3.653".into(),
            ],
        ];
        let result = find_grouped_columns(&header, &raw);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].0, "单体电池电压-1");
        assert_eq!(result[0].2, 3); // 3 elements per row
    }

    #[test]
    fn test_find_grouped_columns_skips_normal_columns() {
        let header = vec!["采集时间".into(), "车速".into()];
        let raw = vec![
            vec!["2026-07-22 20:59:10".into(), "2026-07-22 20:59:00".into()],
            vec!["10.5".into(), "20.3".into()],
        ];
        let result = find_grouped_columns(&header, &raw);
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn test_find_grouped_columns_handles_unit_suffix() {
        // Values with "V" suffix like "3.656V"
        let header = vec!["采集时间".into(), "单体电池电压-1".into()];
        let raw = vec![
            vec!["2026-07-22 20:59:10".into()],
            vec!["3.654,3.655,3.656V".into()],
        ];
        let result = find_grouped_columns(&header, &raw);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].2, 3);
    }

    #[test]
    fn test_find_grouped_columns_from_real_file() {
        // Test against the actual Excel file
        use calamine::{open_workbook, Reader, Xlsx};

        let path = std::path::Path::new("/Users/ward/Desktop/claude/车辆历史状态监控数据 (16).xlsx");
        if !path.exists() {
            eprintln!("Excel file not found at {:?}, skipping real file test", path);
            return;
        }

        let mut workbook: Xlsx<_> = open_workbook(&path)
            .expect("Failed to open Excel file");
        let sheet_name = workbook.sheet_names().first().unwrap().clone();
        let range = workbook.worksheet_range(&sheet_name).expect("Failed to read sheet");

        let mut rows_iter = range.rows();
        let header: Vec<String> = rows_iter.next().unwrap()
            .iter().map(|c| c.to_string()).collect();

        let col_count = header.len();
        let mut raw_cols: Vec<Vec<String>> = vec![Vec::new(); col_count];
        for row in rows_iter {
            for (i, cell) in row.iter().enumerate() {
                if i < col_count {
                    raw_cols[i].push(cell.to_string());
                }
            }
        }

        let grouped = find_grouped_columns(&header, &raw_cols);
        assert!(!grouped.is_empty(), "Expected at least one grouped column");

        for (name, values, element_count) in &grouped {
            println!("  Grouped column: {} ({} elements, {} samples)", name, element_count, values.len());
        }

        // Check for 单体电池电压-1
        let has_bt = grouped.iter().any(|(n, _, _)| n.contains("单体电池电压"));
        assert!(has_bt, "Expected 单体电池电压-1 column");

        // Verify first grouped column has the right format
        let (_name, values, element_count) = &grouped[0];
        assert!(*element_count > 50, "Expected >50 elements, got {}", element_count);

        // Parse one row
        let first = values.iter().find(|v| v.contains(',')).unwrap();
        let parts: Vec<f64> = first.split(',')
            .filter_map(|p| {
                let trimmed = p.trim().trim_end_matches(|c: char| !c.is_ascii_digit() && c != '.');
                trimmed.parse::<f64>().ok()
            })
            .collect();
        assert_eq!(parts.len(), *element_count);
        println!("  First row parsed {} values: min={:.4}, max={:.4}",
            parts.len(),
            parts.iter().cloned().fold(f64::INFINITY, f64::min),
            parts.iter().cloned().fold(f64::NEG_INFINITY, f64::max));
    }

    #[test]
    fn test_sparse_numeric_column_not_skipped() {
        // 稀疏采集信号：70% 行为空，非空行全部可解析为数值（如 BrkPdlPos 场景）
        let header = vec!["event_time".into(), "BrkPdlPos".into()];
        let raw = vec![
            vec!["2026-08-30 00:00:08".into(), "2026-08-30 00:00:09".into(), "2026-08-30 00:00:10".into()],
            vec!["0".into(), "".into(), "11.76471".into()],
        ];
        let (data, cols) = parse_columns(&header, &raw);
        assert_eq!(cols[1].col_type, ColumnType::Numeric, "稀疏数值列不应被跳过");
        assert!(data.contains_key("BrkPdlPos"));
    }

    #[test]
    fn test_sparse_non_numeric_still_skipped() {
        // 非空行中一半以上解析不了的列仍应跳过
        let header = vec!["event_time".into(), "notes".into()];
        let raw = vec![
            vec!["2026-08-30 00:00:08".into(), "2026-08-30 00:00:09".into(), "2026-08-30 00:00:10".into()],
            vec!["hello".into(), "".into(), "world".into()],
        ];
        let (_data, cols) = parse_columns(&header, &raw);
        assert_eq!(cols[1].col_type, ColumnType::Skip);
    }

    #[test]
    fn test_sparse_time_column_not_skipped() {
        // 稀疏时间列：非空单元格可解析为时间 → Time
        let header = vec!["event_time".into(), "speed".into()];
        let raw = vec![
            vec!["2026-08-30 00:00:08".into(), "".into(), "2026-08-30 00:00:10".into()],
            vec!["10".into(), "20".into(), "30".into()],
        ];
        let (_data, cols) = parse_columns(&header, &raw);
        assert_eq!(cols[0].col_type, ColumnType::Time);
    }

    #[test]
    fn test_export_file_sparse_signals_not_skipped() {
        // 端到端验证：真实导出文件中的稀疏信号列不再被跳过
        use calamine::{open_workbook, Reader, Xlsx};

        let path = std::path::Path::new("/Users/ward/Desktop/claude/export_canlin_time_align_427csuv_20260903103439_非事件采集.xlsx");
        if !path.exists() {
            eprintln!("export file not found, skipping real file test");
            return;
        }
        let mut workbook: Xlsx<_> = open_workbook(path).expect("open");
        let sheet_name = workbook.sheet_names().first().unwrap().clone();
        let range = workbook.worksheet_range(&sheet_name).expect("range");
        let mut rows_iter = range.rows();
        let header: Vec<String> = rows_iter.next().unwrap().iter().map(|c| c.to_string()).collect();
        let col_count = header.len();
        let mut raw_cols: Vec<Vec<String>> = vec![Vec::new(); col_count];
        for row in rows_iter {
            for (i, cell) in row.iter().enumerate() {
                if i < col_count { raw_cols[i].push(cell.to_string()); }
            }
        }
        let (_data, cols) = parse_columns(&header, &raw_cols);
        for name in ["BrkPdlPos", "VehSpdAvg", "SCUShiftrLvrPosnbkp"] {
            let col = cols.iter().find(|c| c.name == name).unwrap_or_else(|| panic!("{} 列缺失", name));
            assert_eq!(col.col_type, ColumnType::Numeric, "{} 应为 Numeric", name);
            println!("  {} -> {:?} ({} samples)", name, col.col_type, col.sample_count);
        }
    }

    #[test]
    fn test_rtm_snapshot_parsing() {
        // Simulate a grouped column value as it comes from the Excel
        let raw_value = "3.654,3.655,3.656,3.657,3.658V";
        let parts: Vec<f64> = raw_value.split(',')
            .filter_map(|p| {
                let trimmed = p.trim().trim_end_matches(|c: char| !c.is_ascii_digit() && c != '.');
                trimmed.parse::<f64>().ok()
            })
            .collect();

        assert_eq!(parts.len(), 5);
        assert!((parts[0] - 3.654).abs() < 0.001);
        assert!((parts[4] - 3.658).abs() < 0.001);

        let max_val = parts.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let min_val = parts.iter().cloned().fold(f64::INFINITY, f64::min);
        let avg_val = parts.iter().sum::<f64>() / parts.len() as f64;

        assert!((max_val - 3.658).abs() < 0.001);
        assert!((min_val - 3.654).abs() < 0.001);
        assert!((avg_val - 3.656).abs() < 0.001);
    }
}
