use std::collections::HashMap;
use crate::state::{ColumnInfo, ColumnType};

/// 常见时间关键词
const TIME_KEYWORDS: &[&str] = &["time", "event", "日期", "时间"];

fn has_time_keyword(name: &str) -> bool {
    let lower = name.to_lowercase();
    TIME_KEYWORDS.iter().any(|kw| lower.contains(kw))
}

/// 解析可能带后缀单位的数值（"100V" → 100.0, "10.5kW" → 10.5）
fn parse_numeric_with_unit(s: &str) -> Option<f64> {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(n) = trimmed.parse::<f64>() {
        return Some(n);
    }
    let num_part: String = trimmed.chars().take_while(|c| c.is_ascii_digit() || *c == '.' || *c == '-').collect();
    if num_part.is_empty() || num_part == "." || num_part == "-" {
        return None;
    }
    num_part.parse::<f64>().ok()
}

pub fn read_csv(path: &str) -> Result<(HashMap<String, Vec<f64>>, Vec<ColumnInfo>, usize), String> {
    // 读取原始字节
    let bytes = std::fs::read(path).map_err(|e| format!("无法读取文件: {}", e))?;

    // 尝试 UTF-8，失败则用 GBK 解码
    let content = match String::from_utf8(bytes.clone()) {
        Ok(s) => s,
        Err(_) => {
            use encoding_rs::GBK;
            let (decoded, _, had_errors) = GBK.decode(&bytes);
            if had_errors {
                return Err("文件编码不支持，请使用 UTF-8 或 GBK 编码".to_string());
            }
            decoded.into_owned()
        }
    };

    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_reader(content.as_bytes());

    let header = reader.headers()
        .map_err(|e| format!("CSV 表头读取失败: {}", e))?
        .iter()
        .map(|h| h.to_string())
        .collect::<Vec<_>>();

    if header.is_empty() {
        return Err("CSV 无表头".to_string());
    }

    let col_count = header.len();
    let mut raw_cols: Vec<Vec<String>> = vec![Vec::new(); col_count];

    for result in reader.records() {
        let record = result.map_err(|e| format!("CSV 行读取失败: {}", e))?;
        for (i, field) in record.iter().enumerate() {
            if i < col_count {
                raw_cols[i].push(field.to_string());
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

        // 时间关键词优先
        if has_time_keyword(name) {
            let mut ts_values = Vec::with_capacity(values.len());
            for v in values {
                let trimmed = v.trim();
                if let Some(num) = parse_numeric_with_unit(trimmed) {
                    if num > 1e9 && num < 2e9 {
                        ts_values.push(num);
                    } else if num > 40000.0 && num < 200000.0 {
                        ts_values.push((num - 25569.0) * 86400.0);
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
        }

        // 数值判断
        let numeric: Vec<Option<f64>> = values.iter()
            .map(|v| parse_numeric_with_unit(v.trim()))
            .collect();

        let valid_count = numeric.iter().filter(|v| v.is_some()).count();
        let valid_ratio = if values.is_empty() { 0.0 } else { valid_count as f64 / values.len() as f64 };

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

    Ok((data, columns, row_count))
}
