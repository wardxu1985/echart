use std::collections::HashMap;
use calamine::{open_workbook, Reader, Xlsx};
use crate::state::{ColumnInfo, ColumnType};

/// 常见时间关键词
const TIME_KEYWORDS: &[&str] = &["time", "event", "日期", "时间"];

pub fn has_time_keyword(name: &str) -> bool {
    let lower = name.to_lowercase();
    TIME_KEYWORDS.iter().any(|kw| lower.contains(kw))
}

pub fn read_excel(path: &str) -> Result<(HashMap<String, Vec<f64>>, Vec<ColumnInfo>, usize), String> {
    let mut workbook: Xlsx<_> = open_workbook(path)
        .map_err(|e| format!("无法打开文件: {}", e))?;

    let sheet_name = workbook.sheet_names().first()
        .ok_or_else(|| "Excel 文件为空（无工作表）".to_string())?
        .clone();

    let range = workbook.worksheet_range(&sheet_name)
        .map_err(|e| format!("读取工作表失败: {}", e))?;

    let mut rows_iter = range.rows();
    let header: Vec<String> = rows_iter.next()
        .ok_or_else(|| "工作表为空（无表头）".to_string())?
        .iter()
        .map(|c| c.to_string())
        .collect();

    if header.is_empty() {
        return Err("工作表无表头".to_string());
    }

    let col_count = header.len();
    // 逐列收集原始字符串
    let mut raw_cols: Vec<Vec<String>> = vec![Vec::new(); col_count];

    for row in rows_iter {
        for (i, cell) in row.iter().enumerate() {
            if i < col_count {
                raw_cols[i].push(cell.to_string());
            }
        }
    }

    let row_count = raw_cols[0].len();
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

        // 先检查是否是时间关键词列（优先于数值检查）
        if has_time_keyword(name) {
            // 尝试解析为时间字符串 → Unix 时间戳
            let mut ts_values = Vec::with_capacity(values.len());
            for v in values {
                let trimmed = v.trim();
                // 先尝试数值解析（可能是 Excel 序列号或 Unix 时间戳）
                if let Some(num) = parse_numeric_with_unit(trimmed) {
                    if num > 1e9 && num < 2e9 {
                        ts_values.push(num); // 已经是 Unix 时间戳
                    } else if num > 40000.0 && num < 200000.0 {
                        ts_values.push((num - 25569.0) * 86400.0); // Excel 序列号
                    } else {
                        ts_values.push(num);
                    }
                } else if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S%.f") {
                    ts_values.push(dt.and_utc().timestamp() as f64);
                } else if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S") {
                    ts_values.push(dt.and_utc().timestamp() as f64);
                } else {
                    ts_values.push(f64::NAN);
                }
            }

            let valid_count = ts_values.iter().filter(|v| v.is_finite()).count();
            let has_data = valid_count as f64 / values.len() as f64 >= 0.5;

            if has_data {
                let min = ts_values.iter().cloned().filter(|v| v.is_finite()).fold(f64::INFINITY, f64::min);
                let max = ts_values.iter().cloned().filter(|v| v.is_finite()).fold(f64::NEG_INFINITY, f64::max);
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

        // 尝试解析为数值（处理后缀单位，如 "100V" → 100）
        let numeric: Vec<Option<f64>> = values.iter()
            .map(|v| parse_numeric_with_unit(v.trim()))
            .collect();

        let valid_count = numeric.iter().filter(|v| v.is_some()).count();
        let valid_ratio = if values.is_empty() { 0.0 } else { valid_count as f64 / values.len() as f64 };

        if valid_ratio < 0.5 {
            // 无法解析为数值 → 跳过
            columns.push(ColumnInfo {
                name: name.clone(),
                col_type: ColumnType::Skip,
                min: 0.0,
                max: 0.0,
                sample_count: 0,
            });
            continue;
        }

        // 数值列处理
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

    Ok((data, columns, row_count))
}

/// 解析可能带后缀单位的数值（"100V" → 100.0, "10.5kW" → 10.5）
fn parse_numeric_with_unit(s: &str) -> Option<f64> {
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
