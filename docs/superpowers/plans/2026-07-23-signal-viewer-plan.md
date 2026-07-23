# CANape风格信号查看器 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 Windows 桌面应用，导入 Excel 信号数据，以折线图展示在时间轴上，支持多窗口对比

**Architecture:** Rust Tauri v2 后端负责 Excel 解析与 LTTB 降采样，HTML + ECharts 前端负责信号选择与图表交互。全量数据驻留 Rust 内存，前端只持有降采样后的展示数据。每个窗口独立维护 WindowState。

**Tech Stack:** Rust (calamine, serde, tauri v2) + 纯 HTML/JS + ECharts

## Global Constraints

- Windows 目标平台（开发在 macOS 进行，交叉编译或 Windows 原生构建）
- ECharts 本地加载，不使用 CDN
- 浅色工程数据展示主题
- 不使用前端框架（纯 HTML/JS）
- 文件名限制：Windows 路径兼容（`\` vs `/` 由 Tauri 处理）
- 单文件最大 500MB 硬限制

---

### Task 1: 安装 Rust 工具链 + Tauri CLI

**Files:** 无（环境准备）

**Interfaces:** 无

- [ ] **Step 1: 安装 Rust**

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
```

- [ ] **Step 2: 验证安装**

```bash
rustc --version
cargo --version
```
Expected: 输出版本号（≥ 1.80）

- [ ] **Step 3: 安装系统依赖（macOS）**

```bash
# macOS: Xcode Command Line Tools（通常已安装）
xcode-select --install 2>/dev/null || echo "已安装或跳过"
```

- [ ] **Step 4: 安装 Tauri CLI（通过 npm）**

```bash
npm install -g @tauri-apps/cli@latest
```

- [ ] **Step 5: 验证 Tauri CLI**

```bash
npx tauri --version
```
Expected: 输出版本号（≥ 2.x）

- [ ] **Step 6: 确认状态**

```bash
rustup show
cargo --version
npx tauri --version
```

---

### Task 2: 脚手架项目 + 文件结构

**Files:**
- Create: `/Users/ward/Desktop/claude/src-tauri/Cargo.toml`
- Create: `/Users/ward/Desktop/claude/src-tauri/tauri.conf.json`
- Create: `/Users/ward/Desktop/claude/src-tauri/src/main.rs`
- Create: `/Users/ward/Desktop/claude/src-tauri/src/lib.rs`
- Create: `/Users/ward/Desktop/claude/src/index.html`
- Create: `/Users/ward/Desktop/claude/package.json`

**Interfaces:**
- Produces: 标准 Tauri v2 项目骨架

- [ ] **Step 1: 使用 Tauri CLI 初始化项目**

```bash
cd /Users/ward/Desktop/claude
cargo init --name signal-viewer
npm init -y
```

- [ ] **Step 2: 创建 src-tauri 目录结构**

```bash
cd /Users/ward/Desktop/claude
mkdir -p src-tauri/src
mkdir -p src/static
```

- [ ] **Step 3: 写入 Cargo.toml**

```toml
[package]
name = "signal-viewer"
version = "0.1.0"
description = "CANape风格信号查看器"
edition = "2021"

[lib]
name = "signal_viewer_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[dependencies]
tauri = { version = "2", features = [] }
tauri-build = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
calamine = "0.26"
uuid = { version = "1", features = ["v4"] }
tauri-plugin-dialog = "2"

[build-dependencies]
tauri-build = { version = "2", features = [] }
```

- [ ] **Step 4: 写入 tauri.conf.json**

```json
{
  "$schema": "https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-config-schema/schema.json",
  "productName": "信号查看器",
  "version": "0.1.0",
  "identifier": "com.signal-viewer.app",
  "build": {
    "frontendDist": "../src",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "",
    "beforeBuildCommand": ""
  },
  "app": {
    "windows": [
      {
        "title": "信号查看器",
        "width": 1400,
        "height": 900,
        "minWidth": 1000,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- [ ] **Step 5: 写入 package.json（添加 tauri 脚本）**

```json
{
  "name": "signal-viewer",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "npx tauri dev",
    "build": "npx tauri build"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0"
  }
}
```

- [ ] **Step 6: 写入最小化 main.rs**

```rust
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    signal_viewer_lib::run()
}
```

- [ ] **Step 7: 写入最小化 lib.rs**

```rust
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 8: 写入最小化 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>信号查看器</title>
</head>
<body>
  <h1>信号查看器 — 就绪</h1>
</body>
</html>
```

- [ ] **Step 9: 验证编译**

```bash
cd /Users/ward/Desktop/claude/src-tauri
cargo check
```
Expected: 编译成功（第一次会下载依赖，耗时较长）

---

### Task 3: Rust 核心数据结构 (state.rs)

**Files:**
- Create: `src-tauri/src/state.rs`
- Create: `src-tauri/src/excel_reader.rs`

**Interfaces:**
- Produces: `AppState`, `WindowState`, `ColumnInfo`, `ColumnType`, `ChartData`, `FileOpenResult`

- [ ] **Step 1: 创建 state.rs**

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
    pub row_count: usize,
}

pub struct AppState {
    pub windows: HashMap<String, WindowState>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            windows: HashMap::new(),
        }
    }

    pub fn get_window(&self, id: &str) -> Option<&WindowState> {
        self.windows.get(id)
    }

    pub fn insert_window(&mut self, id: String, state: WindowState) {
        self.windows.insert(id, state);
    }

    pub fn remove_window(&mut self, id: &str) {
        self.windows.remove(id);
    }
}
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/ward/Desktop/claude/src-tauri && cargo check
```
Expected: 编译通过

---

### Task 4: Rust Excel 读取器 (excel_reader.rs)

**Files:**
- Modify: `src-tauri/src/excel_reader.rs`

**Interfaces:**
- Produces: `read_excel(path: &str) -> Result<(HashMap<String, Vec<f64>>, Vec<ColumnInfo>), String>`
- Produces: `has_time_keyword(name: &str) -> bool`

- [ ] **Step 1: 写入 excel_reader.rs**

```rust
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

        // 尝试解析为数值
        let numeric: Vec<Option<f64>> = values.iter()
            .map(|v| v.trim().parse::<f64>().ok())
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

        // 判断是否为时间列
        let col_type = if has_time_keyword(name) {
            // 尝试解析为 Unix 时间戳
            let ts_values: Vec<f64> = numeric.iter().filter_map(|v| *v).collect();
            if ts_values.len() > 5 {
                // 检查是否像时间戳（1e9 ~ 2e9 范围）
                let avg = ts_values.iter().sum::<f64>() / ts_values.len() as f64;
                if avg > 1e9 && avg < 2e9 {
                    ColumnType::Time
                } else {
                    // 尝试将 Excel 日期序列号转为时间戳
                    // Excel 日期序列号: 1900-01-01 = 1, 每 +1 为一天
                    // 转为 Unix 时间戳: (serial - 25569) * 86400
                    let converted: Vec<f64> = ts_values.iter()
                        .map(|v| (v - 25569.0) * 86400.0)
                        .collect();
                    data.insert(name.clone(), converted);
                    let min = ts_values.iter().cloned().fold(f64::INFINITY, f64::min);
                    let max = ts_values.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
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
            ColumnType::Time
        } else {
            ColumnType::Numeric
        };

        let parsed: Vec<f64> = numeric.iter().map(|v| v.unwrap_or(f64::NAN)).collect();
        let min = parsed.iter().cloned().filter(|v| !v.is_nan()).fold(f64::INFINITY, f64::min);
        let max = parsed.iter().cloned().filter(|v| !v.is_nan()).fold(f64::NEG_INFINITY, f64::max);

        // 时间列如果已经是时间戳范围内，保留原始值
        if col_type == ColumnType::Time {
            data.insert(name.clone(), parsed);
        } else {
            data.insert(name.clone(), parsed);
        }

        columns.push(ColumnInfo {
            name: name.clone(),
            col_type,
            min: if min.is_finite() { min } else { 0.0 },
            max: if max.is_finite() { max } else { 0.0 },
            sample_count: valid_count,
        });
    }

    Ok((data, columns, row_count))
}
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/ward/Desktop/claude/src-tauri && cargo check
```
Expected: 编译通过

---

### Task 5: Rust LTTB 降采样 (downsample.rs)

**Files:**
- Create: `src-tauri/src/downsample.rs`

**Interfaces:**
- Produces: `lttb_downsample(x: &[f64], y: &[f64], target: usize) -> (Vec<usize>, Vec<f64>, Vec<f64>)`
- Produces: `detect_gaps(timestamps: &[f64], multiplier: f64) -> Vec<bool>`

- [ ] **Step 1: 写入 downsample.rs**

```rust
/// Largest Triangle Three Buckets 降采样
/// 保留时序视觉特征，适用于高采样率 CAN 信号
pub fn lttb_downsample(
    x: &[f64],
    y: &[f64],
    target: usize,
) -> (Vec<usize>, Vec<f64>, Vec<f64>) {
    let n = x.len();
    if n <= target || target < 3 {
        let indices: Vec<usize> = (0..n).collect();
        return (indices, x.to_vec(), y.to_vec());
    }

    let mut sampled_indices = Vec::with_capacity(target);
    sampled_indices.push(0); // 保留首点

    let bucket_size = (n - 2) as f64 / (target - 2) as f64;

    for i in 1..(target - 1) {
        let bucket_start = ((i - 1) as f64 * bucket_size) as usize + 1;
        let bucket_end = (i as f64 * bucket_size) as usize + 1;
        let end = bucket_end.min(n - 1);

        // 计算桶内平均值
        let mut avg_x = 0.0;
        let mut avg_y = 0.0;
        let count = end - bucket_start;
        if count > 0 {
            for j in bucket_start..end {
                avg_x += x[j];
                avg_y += y[j];
            }
            avg_x /= count as f64;
            avg_y /= count as f64;
        }

        // 在上一个采样点和平均值构成的三角形中找最大面积的点
        let prev_idx = sampled_indices[sampled_indices.len() - 1];
        let mut max_area = -1.0f64;
        let mut max_idx = bucket_start;

        for j in bucket_start..end {
            let area = ((x[prev_idx] - avg_x) * (y[j] - avg_y)
                - (x[prev_idx] - avg_x) * (y[j] - avg_y))
                .abs();
            if area > max_area {
                max_area = area;
                max_idx = j;
            }
        }
        sampled_indices.push(max_idx);
    }

    sampled_indices.push(n - 1); // 保留末点

    let sampled_x: Vec<f64> = sampled_indices.iter().map(|&i| x[i]).collect();
    let sampled_y: Vec<f64> = sampled_indices.iter().map(|&i| y[i]).collect();

    (sampled_indices, sampled_x, sampled_y)
}

/// 检测时间断点
/// 间隔超出中位数 × multiplier 的标记为断点
pub fn detect_gaps(timestamps: &[f64], multiplier: f64) -> Vec<bool> {
    if timestamps.len() < 2 {
        return vec![false; timestamps.len()];
    }

    let mut diffs: Vec<f64> = timestamps.windows(2).map(|w| w[1] - w[0]).collect();

    if diffs.is_empty() {
        return vec![false; timestamps.len()];
    }

    // 计算中位数间隔
    diffs.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());
    let median = if diffs.len() % 2 == 0 {
        (diffs[diffs.len() / 2 - 1] + diffs[diffs.len() / 2]) / 2.0
    } else {
        diffs[diffs.len() / 2]
    };

    let threshold = median * multiplier;
    let mut gaps = vec![false; timestamps.len()];

    for (i, &diff) in diffs.iter().enumerate() {
        if diff > threshold {
            gaps[i + 1] = true; // 从 i+1 位置开始断点
        }
    }

    gaps
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lttb_basic() {
        let x: Vec<f64> = (0..100).map(|i| i as f64).collect();
        let y: Vec<f64> = (0..100).map(|i| (i as f64).sin()).collect();
        let (indices, sx, sy) = lttb_downsample(&x, &y, 10);
        assert_eq!(sx.len(), 10);
        assert_eq!(sy.len(), 10);
        assert_eq!(indices.len(), 10);
        assert_eq!(sx[0], 0.0);
        assert_eq!(sx[9], 99.0);
    }

    #[test]
    fn test_lttb_small_input() {
        let x = vec![1.0, 2.0, 3.0];
        let y = vec![10.0, 20.0, 30.0];
        let (indices, sx, sy) = lttb_downsample(&x, &y, 10);
        assert_eq!(sx.len(), 3);
        assert_eq!(sy, y);
    }

    #[test]
    fn test_detect_gaps() {
        let ts = vec![0.0, 1.0, 2.0, 10.0, 11.0, 12.0];
        let gaps = detect_gaps(&ts, 2.0);
        assert!(gaps[3]); // 2→10 的跳变
        assert!(!gaps[0]);
        assert!(!gaps[1]);
    }
}
```

- [ ] **Step 2: 运行测试验证**

```bash
cd /Users/ward/Desktop/claude/src-tauri && cargo test downsample -- --nocapture
```
Expected: 3 test cases passed

---

### Task 6: Rust Tauri Commands (commands.rs + lib.rs wiring)

**Files:**
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `open_file(path)`, `get_series(window_id, columns, time_start?, time_end?)`, `close_window(window_id)`

- [ ] **Step 1: 写入 commands.rs**

```rust
use std::collections::HashMap;
use tauri::{AppHandle, Manager, State};
use crate::state::{AppState, ChartData, ColumnInfo, ColumnType, FileOpenResult, SeriesData, TimeRange, WindowState};
use crate::excel_reader::read_excel;
use crate::downsample::{lttb_downsample, detect_gaps};

const DOWNSAMPLE_TARGET: usize = 5000;
const MAX_SERIES: usize = 20;

#[tauri::command]
pub fn open_file(
    path: String,
    inherit_from: Option<String>,
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

    let (data, columns, row_count) = read_excel(&path)?;

    if data.is_empty() {
        return Err("文件中未找到有效数值列".to_string());
    }

    let window_id = uuid::Uuid::new_v4().to_string();

    let window_state = WindowState {
        raw_data: data,
        columns: columns.clone(),
        row_count,
    };

    // 插入到全局状态
    let windows = &mut state.windows;
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
    let window = state.get_window(&window_id)
        .ok_or_else(|| format!("窗口 {} 不存在", window_id))?;

    if columns.is_empty() {
        return Err("请至少选择 1 个信号".to_string());
    }

    if columns.len() > MAX_SERIES {
        return Err(format!("最多选择 {} 个信号，当前选择了 {}", MAX_SERIES, columns.len()));
    }

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
            // 如果无时间列，使用第一列作为参考（行序号）
            window.columns.iter()
                .find(|c| c.col_type == ColumnType::Numeric)
                .map(|c| c.name.as_str())
                .unwrap_or("")
        });

    if time_col.is_empty() {
        return Err("未找到可用时间列".to_string());
    }

    let timestamps = window.raw_data.get(time_col)
        .ok_or_else(|| "时间列数据缺失".to_string())?;

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
        if let Some(values) = window.raw_data.get(col_name) {
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
            // Unix 时间戳转 ISO 字符串
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
    state.windows.remove(&window_id);
    Ok(())
}

#[tauri::command]
pub async fn pick_file(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file = app.dialog()
        .file()
        .add_filter("Excel", &["xlsx", "xls"])
        .blocking_pick_file();
    Ok(file.map(|f| f.path.to_string_lossy().to_string()))
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

/// 简单 Unix 时间戳转 ISO 字符串
/// 不使用 chrono crate 以减少依赖
fn chrono_precise(secs: i64, _nanos: u32) -> Option<String> {
    // 使用简单算法：从 1970-01-01 开始计算
    // 注意：这里只是基础实现，实际应使用 chrono crate
    // Tauri 项目中建议添加 chrono 依赖
    Some(format!("{}", secs))
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
}
```

- [ ] **Step 2: 更新 Cargo.toml 添加 chrono 依赖**

```toml
# 在 [dependencies] 下添加
chrono = "0.4"
```

- [ ] **Step 3: 更新 commands.rs 中的 chrono_precise 函数**

```rust
fn chrono_precise(secs: i64, nanos: u32) -> Option<String> {
    let dt = chrono::DateTime::from_timestamp(secs, nanos)?;
    Some(dt.format("%Y-%m-%d %H:%M:%S%.3f").to_string())
}
```

- [ ] **Step 4: 更新 lib.rs 连接所有模块**

```rust
mod state;
mod excel_reader;
mod downsample;
mod commands;

pub fn run() {
    let app_state = state::AppState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::open_file,
            commands::get_series,
            commands::close_window,
            commands::pick_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: 编译验证 + 测试**

```bash
cd /Users/ward/Desktop/claude/src-tauri && cargo test && cargo check
```
Expected: 编译通过，所有测试通过

---

### Task 7: 前端基础 HTML 布局

**Files:**
- Modify: `src/index.html`
- Create: `src/static/style.css`

**Interfaces:**
- Consumes: `ColumnInfo`, `FileOpenResult` (from Rust IPC)
- Produces: 页面布局 HTML + CSS

- [ ] **Step 1: 写入完整 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>信号查看器</title>
  <link rel="stylesheet" href="static/style.css">
</head>
<body>
  <!-- 菜单栏 -->
  <div id="menuBar">
    <div class="menu-item" onclick="onOpenFile()">📂 打开文件</div>
    <div class="menu-item" id="menuNewWindow" onclick="onNewWindow()" style="display:none;">🪟 以新窗口打开</div>
  </div>

  <!-- 主内容区 -->
  <div id="mainLayout">
    <!-- 左面板 -->
    <div id="leftPanel">
      <div id="fileInfo">
        <div id="fileLabel">未加载文件</div>
      </div>

      <div class="panel-section">
        <label class="section-title">X 轴（时间）</label>
        <select id="xSelect" disabled>
          <option value="">— 请先打开文件 —</option>
        </select>
      </div>

      <div class="panel-section">
        <label class="section-title">信号</label>
        <button id="selectSignalBtn" disabled onclick="openSignalDialog()">选择信号...</button>
        <div id="signalTags"></div>
        <div class="tag-count" id="signalCount">已选 0 个信号</div>
      </div>

      <button id="generateBtn" disabled onclick="generateChart()">🎨 生成图表</button>
    </div>

    <!-- 图表区 -->
    <div id="chartArea">
      <div id="chartPlaceholder">
        <p>📊 请打开 Excel 文件，选择信号后生成图表</p>
      </div>
      <div id="chartContainer" style="display:none;"></div>
      <div id="dataZoomBar"></div>
    </div>
  </div>

  <!-- 信号选择弹窗 -->
  <div id="signalDialogOverlay" class="dialog-overlay" style="display:none;">
    <div id="signalDialog" class="dialog">
      <div class="dialog-header">
        <h3>选择信号</h3>
        <span class="dialog-close" onclick="closeSignalDialog()">✕</span>
      </div>
      <div class="dialog-body">
        <input type="text" id="signalSearch" placeholder="搜索信号名称..." oninput="onSignalSearch(this.value)">
        <div id="signalList"></div>
      </div>
      <div class="dialog-footer">
        <span id="dialogCount">已选 0 / 0 个信号</span>
        <div class="dialog-actions">
          <button onclick="selectAllFiltered()">全选</button>
          <button onclick="clearAllFiltered()">清空</button>
          <button class="btn-primary" onclick="confirmSignalSelection()">确定</button>
          <button onclick="closeSignalDialog()">取消</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Toast 容器 -->
  <div id="toastContainer"></div>

  <!-- 状态栏 -->
  <div id="statusBar">
    <span id="statusLeft">就绪</span>
    <span id="statusRight"></span>
  </div>

  <script src="static/echarts.min.js"></script>
  <script src="static/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: 写入 style.css（浅色工程风格）**

```css
/* ===== 全局重置 ===== */
* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  height: 100%;
  overflow: hidden;
  font-family: 'Segoe UI', 'Microsoft YaHei', Arial, sans-serif;
  font-size: 13px;
  color: #1a1a2e;
  background: #ffffff;
  user-select: none;
}

/* ===== 菜单栏 ===== */
#menuBar {
  display: flex;
  align-items: center;
  gap: 0;
  height: 32px;
  padding: 0 4px;
  background: #f0f1f3;
  border-bottom: 1px solid #d0d5dd;
}

.menu-item {
  padding: 4px 14px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
  color: #1a1a2e;
}

.menu-item:hover {
  background: #e0e4ea;
}

/* ===== 主布局 ===== */
#mainLayout {
  display: flex;
  height: calc(100vh - 32px - 28px);
  /* 减去菜单栏和状态栏 */
}

/* ===== 左面板 ===== */
#leftPanel {
  width: 300px;
  min-width: 260px;
  max-width: 400px;
  flex-shrink: 0;
  background: #f5f6f8;
  border-right: 1px solid #d0d5dd;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow-y: auto;
}

#fileInfo {
  margin-bottom: 20px;
}

#fileLabel {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
  word-break: break-all;
}

.panel-section {
  margin-bottom: 16px;
}

.section-title {
  display: block;
  font-size: 12px;
  color: #5f6b7a;
  margin-bottom: 6px;
  font-weight: 600;
}

#xSelect {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #d0d5dd;
  border-radius: 4px;
  background: #ffffff;
  font-size: 13px;
  color: #1a1a2e;
  outline: none;
}

#xSelect:focus {
  border-color: #2b5fa8;
  box-shadow: 0 0 0 2px rgba(43, 95, 168, 0.15);
}

#xSelect:disabled {
  background: #f0f1f3;
  color: #9aa0a6;
}

#selectSignalBtn {
  width: 100%;
  padding: 8px 12px;
  border: 1px dashed #b0b5c0;
  border-radius: 4px;
  background: #ffffff;
  color: #5f6b7a;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

#selectSignalBtn:hover:not(:disabled) {
  border-color: #2b5fa8;
  color: #2b5fa8;
  background: #f5f8fe;
}

#selectSignalBtn:disabled {
  background: #f0f1f3;
  color: #9aa0a6;
  cursor: not-allowed;
}

#signalTags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
  min-height: 28px;
}

.signal-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: #e8f0fe;
  color: #1a1a2e;
  border-radius: 4px;
  font-size: 12px;
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.signal-tag .tag-remove {
  cursor: pointer;
  color: #9aa0a6;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}

.signal-tag .tag-remove:hover {
  color: #d32f2f;
}

.tag-count {
  font-size: 11px;
  color: #9aa0a6;
  margin-top: 4px;
}

#generateBtn {
  width: 100%;
  padding: 10px 0;
  margin-top: auto;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  background: #2b5fa8;
  color: #ffffff;
}

#generateBtn:hover:not(:disabled) {
  background: #1e4682;
}

#generateBtn:disabled {
  background: #d0d5dd;
  color: #9aa0a6;
  cursor: not-allowed;
}

/* ===== 图表区 ===== */
#chartArea {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px;
}

#chartPlaceholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9aa0a6;
  font-size: 16px;
}

#chartContainer {
  flex: 1;
  min-height: 0;
}

#dataZoomBar {
  height: 40px;
  flex-shrink: 0;
}

/* ===== 弹窗 ===== */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  width: 480px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid #e0e4ea;
}

.dialog-header h3 {
  font-size: 16px;
  color: #1a1a2e;
}

.dialog-close {
  cursor: pointer;
  color: #9aa0a6;
  font-size: 18px;
  padding: 4px;
}

.dialog-close:hover {
  color: #1a1a2e;
}

.dialog-body {
  padding: 12px 20px;
  overflow-y: auto;
  flex: 1;
}

#signalSearch {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d0d5dd;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  margin-bottom: 8px;
  color: #1a1a2e;
}

#signalSearch:focus {
  border-color: #2b5fa8;
  box-shadow: 0 0 0 2px rgba(43, 95, 168, 0.15);
}

#signalList {
  max-height: 400px;
  overflow-y: auto;
}

.signal-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.signal-item:hover {
  background: #eef1f5;
}

.signal-item input[type="checkbox"] {
  margin: 0;
  cursor: pointer;
}

.signal-item label {
  cursor: pointer;
  flex: 1;
  font-size: 13px;
  color: #1a1a2e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.signal-item .signal-range {
  font-size: 11px;
  color: #9aa0a6;
  font-family: Consolas, monospace;
}

.dialog-footer {
  padding: 12px 20px 16px;
  border-top: 1px solid #e0e4ea;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dialog-actions {
  display: flex;
  gap: 8px;
}

.dialog-actions button {
  padding: 6px 14px;
  border: 1px solid #d0d5dd;
  border-radius: 4px;
  background: #ffffff;
  color: #1a1a2e;
  font-size: 12px;
  cursor: pointer;
}

.dialog-actions button:hover {
  background: #eef1f5;
}

.dialog-actions .btn-primary {
  background: #2b5fa8;
  color: #ffffff;
  border-color: #2b5fa8;
}

.dialog-actions .btn-primary:hover {
  background: #1e4682;
}

/* ===== Toast ===== */
#toastContainer {
  position: fixed;
  top: 48px;
  right: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toast {
  padding: 10px 16px;
  border-radius: 6px;
  font-size: 13px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  animation: toastIn 0.25s ease-out;
  max-width: 360px;
}

.toast-info { background: #e8f0fe; color: #1a1a2e; border-left: 3px solid #2b5fa8; }
.toast-error { background: #fdecea; color: #c62828; border-left: 3px solid #c62828; }
.toast-success { background: #e8f5e9; color: #2e7d32; border-left: 3px solid #2e7d32; }

@keyframes toastIn {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}

/* ===== 状态栏 ===== */
#statusBar {
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: #e8eaed;
  border-top: 1px solid #d0d5dd;
  font-size: 12px;
  color: #5f6b7a;
}

/* ===== 滚动条 ===== */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #c0c4cc; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #a0a4ac; }
```

- [ ] **Step 3: 创建占位文件**

```bash
touch /Users/ward/Desktop/claude/src/static/app.js
```

---

### Task 8: ECharts 下载

**Files:**
- Create: `src/static/echarts.min.js`

- [ ] **Step 1: 下载 ECharts（本地加载）**

```bash
cd /Users/ward/Desktop/claude/src/static
npm pack echarts 2>/dev/null || npx -y echarts > /dev/null 2>&1
```

如果 npm 方式不行，手动下载：

```bash
curl -L "https://registry.npmmirror.com/echarts/5.5.1/files/dist/echarts.min.js" -o echarts.min.js
ls -lh echarts.min.js
```
Expected: 文件存在，约 1MB

---

### Task 9: 前端核心逻辑 — 状态管理与 IPC 桥

**Files:**
- Modify: `src/static/app.js`

**Interfaces:**
- Consumes: Tauri `invoke()` API
- Produces: `TauriBridge`, `UIState`, toast 系统

- [ ] **Step 1: 写入 app.js — TauriBridge + UIState + 工具函数**

```javascript
// ===== 运行时检测 =====
const isTauri = () => typeof window !== 'undefined' && window.__TAURI_INTERNALS__;
const invoke = (cmd, args) => {
  if (!isTauri()) {
    console.warn('[DEV] Tauri IPC 不可用，返回 mock');
    return Promise.reject('Tauri 运行时不可用');
  }
  return window.__TAURI_INTERNALS__.invoke(cmd, args);
};

// ===== UI 状态 =====
const state = {
  windowId: '',
  columns: [],           // ColumnInfo[] from Rust
  selectedXCol: null,    // string | null
  selectedYCols: new Set(), // Set<string>
  rawColumns: [],        // 备选时间列
  numericColumns: [],    // 数值信号列
  fileLoaded: false,
};

// ===== Toast 系统 =====
function showToast(msg, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ===== Tauri IPC 封装 =====
const TauriBridge = {
  async openFile(path, inheritFrom = null) {
    const args = { path };
    if (inheritFrom) args.inherit_from = inheritFrom;
    return invoke('open_file', args);
  },

  async getSeries(windowId, columns, timeStart = null, timeEnd = null) {
    const args = { windowId, columns };
    if (timeStart !== null) args.time_start = timeStart;
    if (timeEnd !== null) args.time_end = timeEnd;
    return invoke('get_series', args);
  },

  async closeWindow(windowId) {
    return invoke('close_window', { windowId });
  },
};
```

- [ ] **Step 2: 提取 URL 参数（窗口 ID 等）**

```javascript
// ===== URL 参数解析 =====
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    wid: params.get('wid') || '',
    inheritColumns: params.get('inherit') || '',
    inheritFrom: params.get('from') || '',
  };
}
```

---

### Task 10: 前端 — 信号选择弹窗

**Files:**
- Modify: `src/static/app.js`

- [ ] **Step 1: 追加信号选择弹窗函数**

```javascript
// ===== 信号选择弹窗 =====
function openSignalDialog() {
  if (!state.fileLoaded) return;
  const dialog = document.getElementById('signalDialogOverlay');
  const list = document.getElementById('signalList');
  const search = document.getElementById('signalSearch');

  search.value = '';
  dialog.style.display = 'flex';
  renderSignalList(state.numericColumns);
  updateDialogCount();
  search.focus();
}

function closeSignalDialog() {
  document.getElementById('signalDialogOverlay').style.display = 'none';
}

function renderSignalList(columns) {
  const list = document.getElementById('signalList');
  list.innerHTML = '';
  columns.forEach((col, idx) => {
    const checked = state.selectedYCols.has(col.name);
    const item = document.createElement('div');
    item.className = 'signal-item';
    item.innerHTML = `
      <input type="checkbox" id="sig_${idx}" value="${escapeHtml(col.name)}"
        ${checked ? 'checked' : ''}>
      <label for="sig_${idx}">${escapeHtml(col.name)}</label>
      <span class="signal-range">${formatNum(col.min)} ~ ${formatNum(col.max)}</span>
    `;
    item.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) {
        state.selectedYCols.add(col.name);
      } else {
        state.selectedYCols.delete(col.name);
      }
      updateDialogCount();
    });
    list.appendChild(item);
  });
}

function onSignalSearch(keyword) {
  const filtered = state.numericColumns.filter(col =>
    col.name.toLowerCase().includes(keyword.toLowerCase())
  );
  renderSignalList(filtered);
  updateDialogCount();
}

function selectAllFiltered() {
  const checkboxes = document.querySelectorAll('#signalList input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = true;
    state.selectedYCols.add(cb.value);
  });
  updateDialogCount();
}

function clearAllFiltered() {
  const checkboxes = document.querySelectorAll('#signalList input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = false;
    state.selectedYCols.delete(cb.value);
  });
  updateDialogCount();
}

function confirmSignalSelection() {
  closeSignalDialog();
  renderSignalTags();
  updateGenerateButton();
  updateStatusBar();
}

function updateDialogCount() {
  document.getElementById('dialogCount').textContent =
    `已选 ${state.selectedYCols.size} / ${state.numericColumns.length} 个信号`;
}

// ===== 工具函数 =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatNum(v) {
  if (v === undefined || v === null || !isFinite(v)) return '—';
  if (Math.abs(v) >= 10000) return v.toExponential(2);
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(2);
}
```

---

### Task 11: 前端 — 左面板交互 + 标签系统

**Files:**
- Modify: `src/static/app.js`

- [ ] **Step 1: 追加左面板交互函数**

```javascript
// ===== 左面板交互 =====
function populateXSelect(columns) {
  const select = document.getElementById('xSelect');
  select.innerHTML = '<option value="">— 选择时间列 —</option>';
  const timeCols = columns.filter(c => c.col_type === 'Time');
  // 如果无时间列，显示所有数值列
  const candidates = timeCols.length > 0 ? timeCols : columns.filter(c => c.col_type === 'Numeric');

  candidates.forEach(col => {
    const opt = document.createElement('option');
    opt.value = col.name;
    opt.textContent = col.name;
    select.appendChild(opt);
  });
  select.disabled = false;

  // 自动选择第一个
  if (candidates.length > 0) {
    select.value = candidates[0].name;
    state.selectedXCol = candidates[0].name;
  }
}

function onXSelectChange() {
  const select = document.getElementById('xSelect');
  state.selectedXCol = select.value || null;
  updateGenerateButton();
}

function renderSignalTags() {
  const container = document.getElementById('signalTags');
  const countEl = document.getElementById('signalCount');
  container.innerHTML = '';
  state.selectedYCols.forEach(name => {
    const tag = document.createElement('span');
    tag.className = 'signal-tag';
    tag.innerHTML = `${escapeHtml(name)} <span class="tag-remove" data-name="${escapeHtml(name)}">×</span>`;
    tag.querySelector('.tag-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      const colName = e.target.getAttribute('data-name');
      state.selectedYCols.delete(colName);
      renderSignalTags();
      updateGenerateButton();
      updateStatusBar();
    });
    container.appendChild(tag);
  });
  countEl.textContent = `已选 ${state.selectedYCols.size} 个信号`;
}

function updateGenerateButton() {
  const btn = document.getElementById('generateBtn');
  btn.disabled = !(
    state.fileLoaded &&
    state.selectedXCol &&
    state.selectedYCols.size > 0
  );
}
```

---

### Task 12: 前端 — ECharts 集成 + 交互

**Files:**
- Modify: `src/static/app.js`

**Interfaces:**
- Consumes: ChartData { x: string[], series: [{ name, y: number[] }] }
- Uses: ECharts 全局对象

- [ ] **Step 1: 追加 ECharts 管理函数**

```javascript
// ===== ECharts 管理 =====
let chart = null;
const CANAPE_COLORS = [
  '#5470C6', '#91CC75', '#FAC858', '#EE6666', '#73C0DE',
  '#3BA272', '#FC8452', '#9A60B4', '#EA7CCC', '#00E5FF',
  '#FF6B6B', '#69F0AE', '#FFD740', '#40C4FF', '#FF80AB',
  '#B388FF',
];

function initChart() {
  if (chart) {
    chart.dispose();
    chart = null;
  }
  const container = document.getElementById('chartContainer');
  container.style.display = 'block';
  chart = echarts.init(container, undefined, {
    renderer: 'canvas',
  });

  // 空配置
  chart.setOption({
    title: { text: '', left: 'center', textStyle: { color: '#9aa0a6', fontSize: 14 } },
    xAxis: { type: 'time', show: false },
    yAxis: { show: false },
    series: [],
    grid: { left: 60, right: 20, top: 20, bottom: 60 },
  });

  // Resize 监听
  window.addEventListener('resize', () => {
    chart && chart.resize();
  });

  // 鼠标悬浮时十字准线
  chart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: '#ffffff',
      borderColor: '#d0d5dd',
      borderWidth: 1,
      textStyle: { color: '#1a1a2e', fontSize: 12 },
    },
  });
}

function renderChart(chartData) {
  if (!chart) initChart();

  // 时间字符串转为 Date
  const xData = chartData.x.map(ts => new Date(ts));

  // 构建 series
  const series = chartData.series.map((s, idx) => ({
    name: s.name,
    type: 'line',
    data: s.y.map((v, i) => [xData[i], v]),
    symbol: 'none',
    lineStyle: { width: 1.5 },
    yAxisIndex: idx,
    connectNulls: false,
    itemStyle: { color: CANAPE_COLORS[idx % CANAPE_COLORS.length] },
  }));

  // 构建 Y 轴（每个信号独立）
  const yAxis = chartData.series.map((s, idx) => ({
    type: 'value',
    name: s.name,
    nameTextStyle: { fontSize: 11, color: '#5f6b7a' },
    axisLine: { show: true, lineStyle: { color: '#e5e7eb' } },
    axisLabel: { fontSize: 10, color: '#9aa0a6' },
    splitLine: { lineStyle: { color: '#e5e7eb', type: 'solid' } },
    position: idx === 0 ? 'left' : 'right',
    offset: idx > 0 ? (idx - 1) * 40 : 0,
  }));

  // 右侧 margin 自适应
  const rightMargin = Math.max(20, Math.min(120, chartData.series.length * 40));

  chart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: '#ffffff',
      borderColor: '#d0d5dd',
      borderWidth: 1,
      textStyle: { color: '#1a1a2e', fontSize: 12 },
    },
    legend: {
      data: chartData.series.map(s => s.name),
      top: 0,
      textStyle: { fontSize: 11, color: '#5f6b7a' },
    },
    grid: {
      left: 50,
      right: rightMargin,
      top: 36,
      bottom: 20,
      containLabel: false,
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: '#d0d5dd' } },
      axisLabel: {
        color: '#5f6b7a',
        fontSize: 11,
        formatter: { value: (v) => {
          const d = new Date(v);
          return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        }},
      },
      splitLine: { lineStyle: { color: '#e5e7eb', type: 'solid' } },
    },
    yAxis,
    series,
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100,
      },
      {
        type: 'slider',
        start: 0,
        end: 100,
        bottom: 0,
        height: 20,
        borderColor: '#d0d5dd',
        backgroundColor: '#f5f6f8',
        fillerColor: 'rgba(43, 95, 168, 0.15)',
        handleStyle: { color: '#2b5fa8' },
        textStyle: { color: '#5f6b7a', fontSize: 10 },
      },
    ],
  });

  chart.resize();
}
```

---

### Task 13: 前端 — 文件打开 + 生成图表 + 多窗口

**Files:**
- Modify: `src/static/app.js`

- [ ] **Step 1: 追加主交互函数**

```javascript
// ===== 文件打开 =====
async function onOpenFile() {
  try {
    const selected = await invoke('pick_file');
    if (!selected) return;

    await loadFile(selected);
  } catch (e) {
    // Tauri IPC 不可用，用 fallback prompt（开发环境）
    console.warn('pick_file 失败，使用 prompt fallback:', e);
    const path = prompt('输入 Excel 文件路径:');
    if (path) await loadFile(path);
  }
}

async function loadFile(path) {
  showToast('正在加载文件...', 'info');

  try {
    const urlParams = getUrlParams();
    const inheritFrom = urlParams.from || null;
    const result = await TauriBridge.openFile(path, inheritFrom);

    if (!result || !result.columns) {
      showToast('文件加载失败：返回数据异常', 'error');
      return;
    }

    state.windowId = result.window_id;
    state.columns = result.columns;
    state.rawColumns = result.columns.filter(c => c.col_type === 'Time');
    state.numericColumns = result.columns.filter(c => c.col_type === 'Numeric');
    state.fileLoaded = true;

    // 更新 UI
    const fileName = path.split(/[/\\]/).pop();
    document.getElementById('fileLabel').textContent = `📁 ${fileName}`;
    document.getElementById('menuNewWindow').style.display = 'inline-block';
    document.getElementById('selectSignalBtn').disabled = false;

    populateXSelect(result.columns);
    updateGenerateButton();
    updateStatusBar();

    // 信号选择弹窗恢复已选
    document.getElementById('signalSearch').value = '';

    // 处理继承信号
    if (urlParams.inheritColumns) {
      const inherited = urlParams.inheritColumns.split(',');
      inherited.forEach(name => {
        if (state.numericColumns.some(c => c.name === name)) {
          state.selectedYCols.add(name);
        } else {
          showToast(`信号 "${name}" 在当前文件中不存在，已跳过`, 'info');
        }
      });
      renderSignalTags();
      updateGenerateButton();
    }

    showToast(`已加载: ${fileName} (${result.row_count} 行, ${result.columns.length} 列)`, 'success');

    // 更新状态栏
    document.getElementById('statusRight').textContent =
      `${result.row_count} 行 × ${result.columns.length} 列`;

  } catch (err) {
    showToast(`加载失败: ${err}`, 'error');
    console.error(err);
  }
}

// ===== 生成图表 =====
async function generateChart() {
  if (!state.selectedXCol || state.selectedYCols.size === 0) {
    showToast('请选择 X 轴和至少一个信号', 'error');
    return;
  }

  if (state.selectedYCols.size > 20) {
    showToast(`最多选择 20 个信号（当前 ${state.selectedYCols.size} 个）`, 'error');
    return;
  }

  showToast('正在生成图表...', 'info');

  try {
    const data = await TauriBridge.getSeries(
      state.windowId,
      Array.from(state.selectedYCols),
      null,
      null
    );

    document.getElementById('chartPlaceholder').style.display = 'none';
    renderChart(data);
    showToast('图表已生成', 'success');
    updateStatusBar();
  } catch (err) {
    showToast(`图表生成失败: ${err}`, 'error');
    console.error(err);
  }
}

// ===== 多窗口 =====
async function onNewWindow() {
  try {
    const selected = await invoke('pick_file');
    if (!selected) return;

    // 编码已选信号为 URL 参数
    const inheritCols = Array.from(state.selectedYCols).join(',');
    const newWindowUrl = `index.html?wid=${uuid()}&inherit=${encodeURIComponent(inheritCols)}&from=${state.windowId}`;

    await invoke('create_window', {
      url: newWindowUrl,
      title: '信号查看器',
      width: 1400,
      height: 900,
    });

    showToast('新窗口已创建', 'success');
  } catch (err) {
    showToast(`打开新窗口失败: ${err}`, 'error');
  }
}

// ===== 状态栏 =====
function updateStatusBar() {
  if (state.fileLoaded) {
    document.getElementById('statusLeft').textContent =
      `已选 ${state.selectedYCols.size} 个信号 | X轴: ${state.selectedXCol || '未选择'}`;
  }
}

// ===== UUID =====
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
```

- [ ] **Step 2: 页面初始化**

```javascript
// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('xSelect').addEventListener('change', onXSelectChange);

  // 监听 Enter 键在搜索框中
  document.getElementById('signalSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmSignalSelection();
    if (e.key === 'Escape') closeSignalDialog();
  });

  // 弹窗点击外部关闭
  document.getElementById('signalDialogOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSignalDialog();
  });

  // 快捷键
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      onOpenFile();
    }
    if (e.key === 'Escape' && document.getElementById('signalDialogOverlay').style.display === 'flex') {
      closeSignalDialog();
    }
  });

  // 初始化图表占位
  initChart();
  document.getElementById('chartContainer').style.display = 'none';
  document.getElementById('chartPlaceholder').style.display = 'flex';
});
```

---

### Task 14: 多窗口 — Tauri Rust 端支持

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/state.rs`

- [ ] **Step 1: 添加 Rust 端的 `open_file` 完整逻辑（使用第二个 `open_file` 命令替代原有的）**

更新 commands.rs 中的 `open_file` 函数已经包含在 Task 6 中。需要增加一个 `create_window` 命令：

```rust
#[tauri::command]
pub fn create_window(
    app: AppHandle,
    url: String,
    title: String,
    width: u32,
    height: u32,
) -> Result<(), String> {
    use tauri::WebviewWindowBuilder;
    use tauri::webview::Page;

    let window_id = uuid::Uuid::new_v4().to_string();
    let builder = WebviewWindowBuilder::new(&app, &window_id, Page::App(&url))
        .title(&title)
        .inner_size(width as f64, height as f64)
        .resizable(true);

    builder.build().map_err(|e| format!("创建窗口失败: {}", e))?;
    Ok(())
}
```

- [ ] **Step 2: 注册新命令**

```rust
// 在 lib.rs 的 invoke_handler 中添加:
commands::create_window,
```

- [ ] **Step 3: 编译验证**

```bash
cd /Users/ward/Desktop/claude/src-tauri && cargo check
```
Expected: 编译通过

---

### Task 15: 错误处理 + 边界测试

**Files:**
- Modify: `src/static/app.js`
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: 完善前端错误处理**

在 `loadFile` 和 `generateChart` 中添加更详细的错误消息映射（已包含在 Task 13 的 try/catch 中），补充空状态处理：

```javascript
// 添加到 app.js 末尾
// 空状态检查
function checkEmptyState() {
  if (!state.fileLoaded) {
    document.getElementById('chartPlaceholder').style.display = 'flex';
    document.getElementById('chartPlaceholder').innerHTML = '<p>📊 请打开 Excel 文件，选择信号后生成图表</p>';
    document.getElementById('chartContainer').style.display = 'none';
  }
}

// 窗口关闭时清理
window.addEventListener('beforeunload', () => {
  if (state.windowId) {
    TauriBridge.closeWindow(state.windowId).catch(() => {});
  }
});
```

- [ ] **Step 2: 更新 generateChart 错误处理（大信号数量限制已在 Task 13 中包含）**

验证最大 20 个信号限制已生效：

```javascript
// generateChart 函数中包含
if (state.selectedYCols.size > 20) {
  showToast(`最多选择 20 个信号（当前 ${state.selectedYCols.size} 个）`, 'error');
  return;
}
```

- [ ] **Step 3: 编译验证全部**

```bash
cd /Users/ward/Desktop/claude/src-tauri && cargo test && cargo check
```
Expected: 全部通过

---

### Task 16: Windows 打包配置

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: 更新 tauri.conf.json 添加打包配置**

```json
{
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.ico"
    ],
    "windows": {
      "wix": null,
      "nsis": {
        "installerIcon": "icons/icon.ico",
        "installMode": "currentUser"
      }
    }
  }
}
```

- [ ] **Step 2: 生成应用图标**

```bash
cd /Users/ward/Desktop/claude
mkdir -p src-tauri/icons
# 创建一个简单的 PNG 图标（32x32, 128x128, 256x256）
# 使用 ImageMagick 或在线工具生成
# 将图标放在 src-tauri/icons/ 目录
```

- [ ] **Step 3: 测试 Dev 运行**

```bash
cd /Users/ward/Desktop/claude
npm run dev
```
Expected: Tauri 窗口打开，显示主界面

- [ ] **Step 4: 构建 Release（macOS 下为 macOS 包，Windows 下为 Windows 包）**

```bash
cd /Users/ward/Desktop/claude
npm run build
```

在 Windows 上运行构建:
```bash
cd /Users/ward/Desktop/claude
npx tauri build
```
Expected: 生成 `.msi` 或 `.exe` 安装包在 `src-tauri/target/release/bundle/`
