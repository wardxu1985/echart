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
    pub vin: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupColumnInfo {
    pub name: String,
    pub element_count: usize,
    pub sample_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RtmTimeEntry {
    pub time_str: String,
    pub timestamp: f64,
    pub max_val: f64,
    pub min_val: f64,
    pub avg_val: f64,
    pub element_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RtmSnapshot {
    pub values: Vec<f64>,
    pub max_val: f64,
    pub min_val: f64,
    pub avg_val: f64,
    pub max_index: usize,
    pub min_index: usize,
    pub element_count: usize,
}

pub struct WindowState {
    pub raw_data: HashMap<String, Vec<f64>>,
    pub columns: Vec<ColumnInfo>,
    /// Comma-separated group columns: column_name -> raw string values per row
    pub raw_grouped_data: HashMap<String, Vec<String>>,
    /// Original time strings (e.g., "2026-07-22 20:59:10")
    pub time_raw_strings: Vec<String>,
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
