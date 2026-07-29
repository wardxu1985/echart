use std::collections::HashMap;
use calamine::{open_workbook, Reader, Xlsx};
use crate::column_parser::{parse_columns, find_vin, find_grouped_columns};
use crate::state::ColumnInfo;

pub fn read_excel(path: &str) -> Result<(HashMap<String, Vec<f64>>, Vec<ColumnInfo>, usize, Option<String>, HashMap<String, Vec<String>>, Vec<String>), String> {
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
    let mut raw_cols: Vec<Vec<String>> = vec![Vec::new(); col_count];

    for row in rows_iter {
        for (i, cell) in row.iter().enumerate() {
            if i < col_count {
                raw_cols[i].push(cell.to_string());
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

    // 提取时间列的原始字符串（第一列为采集时间）
    let time_raw_strings: Vec<String> = if !raw_cols.is_empty() {
        let first_col = &raw_cols[0];
        // 检查表头是否包含时间关键词
        let is_time_col = first_col.is_empty() || crate::column_parser::has_time_keyword(&header[0]);
        if is_time_col {
            raw_cols[0].clone()
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    };

    Ok((data, columns, row_count, vin, raw_grouped_data, time_raw_strings))
}
