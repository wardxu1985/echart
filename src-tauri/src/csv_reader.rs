use std::collections::HashMap;
use crate::column_parser::{parse_columns, find_vin, find_grouped_columns};
use crate::state::ColumnInfo;

pub fn read_csv(path: &str) -> Result<(HashMap<String, Vec<f64>>, Vec<ColumnInfo>, usize, Option<String>, HashMap<String, Vec<String>>, Vec<String>), String> {
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

    let row_count = raw_cols.first().map_or(0, |c| c.len());
    let vin = find_vin(&header, &raw_cols);
    let (data, columns) = parse_columns(&header, &raw_cols);

    // 检测逗号分隔的组数据列
    let grouped = find_grouped_columns(&header, &raw_cols);
    let mut raw_grouped_data: HashMap<String, Vec<String>> = HashMap::new();
    for (name, strings, _count) in &grouped {
        raw_grouped_data.insert(name.clone(), strings.clone());
    }

    // 提取时间列的原始字符串
    let time_raw_strings: Vec<String> = if !raw_cols.is_empty() {
        raw_cols[0].clone()
    } else {
        Vec::new()
    };

    Ok((data, columns, row_count, vin, raw_grouped_data, time_raw_strings))
}
