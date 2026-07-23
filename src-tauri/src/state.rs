use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ColumnType {
    Time,
    Numeric,
    Skip,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub col_type: ColumnType,
    pub min: f64,
    pub max: f64,
    pub sample_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeRange {
    pub start: f64,  // Unix timestamp
    pub end: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOpenResult {
    pub columns: Vec<ColumnInfo>,
    pub time_range: TimeRange,
    pub row_count: usize,
    pub window_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeriesData {
    pub name: String,
    pub y: Vec<Option<f64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartData {
    pub x: Vec<String>,           // ISO 时间字符串
    pub series: Vec<SeriesData>,
}

pub struct WindowState {
    pub raw_data: HashMap<String, Vec<f64>>,
    pub columns: Vec<ColumnInfo>,
}

pub struct AppState {
    pub windows: Mutex<HashMap<String, WindowState>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            windows: Mutex::new(HashMap::new()),
        }
    }
}
