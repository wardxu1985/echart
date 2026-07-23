# CANape风格数据查看器 — 设计文档

**日期**: 2026-07-23
**技术栈**: Rust Tauri v2 + HTML + ECharts
**目标平台**: Windows

## 1. 需求概述

桌面应用（Windows），导入 Excel 格式的车辆 CAN 信号数据，以折线图形式在同一时间轴（X 轴）上展示多个信号，提供类似 Vector CANape Measurement 的交互体验。

### 核心功能

- 打开 Excel 文件，解析信号数据
- 选择信号（弹窗 + 模糊搜索），支持多选
- 选中信号以标签形式展示在主界面，支持单个移除
- 折线图展示（多 Y 轴，共享时间 X 轴）
- 图表交互：缩放、平移、悬浮显示数据值
- 多窗口：一个窗口一个文件，多个窗口独立打开用于对比
- 新窗口打开时继承当前窗口的已选信号（仅继承选择，不自动生成图表）

### 非功能需求

- 支持 50MB / 5 万行级别的 Excel 文件
- 浅色工程数据展示风格（区别于暗色 CANape 风格）

## 2. 整体架构

```
┌── Tauri App ──────────────────────────────────────────┐
│                                                        │
│  ┌─ Rust 后端 ──────────────────────────────────────┐  │
│  │                                                    │  │
│  │  AppState (HashMap<window_id, WindowState>)        │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │ WindowState:                                 │  │  │
│  │  │  raw_data: HashMap<String, Vec<f64>>         │  │  │
│  │  │  columns: Vec<ColumnInfo>                    │  │  │
│  │  │  row_count: usize                            │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  │                                                    │  │
│  │  Tauri Commands:                                   │  │
│  │   • open_file(path, inherit_from?) → ColumnInfo[]  │  │
│  │   • get_series(columns, range?) → ChartData        │  │
│  └────────────────────────────────────────────────────┘  │
│                                                        │
│  ┌─ 前端 HTML ──────────────────────────────────────┐  │
│  │  index.html + app.js + style.css + echarts.min.js │  │
│  │                                                    │  │
│  │  ┌──────────────┐  ┌────────────────────────┐     │  │
│  │  │ 左面板        │  │ ECharts 图表           │     │  │
│  │  │ X轴下拉      │  │ dataZoom(缩放/平移)    │     │  │
│  │  │ 信号选择弹窗  │  │ tooltip(悬浮值)        │     │  │
│  │  │ 已选标签+移除  │  │ multi-Y axis          │     │  │
│  │  │ 生成按钮      │  │ light theme           │     │  │
│  │  └──────────────┘  └────────────────────────┘     │  │
│  └────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### 核心原则

- Rust 持有全量数据，前端只持有降采样后的展示数据
- 用户选好信号后点击生成 → Rust 降采样回传 → ECharts 渲染
- 缩放平移只操作前端已有数据，不触发 IPC
- 每个窗口一个独立的 Rust WindowState，互不干扰

## 3. 数据流

```
用户打开文件
    │
    ▼
Rust: calamine 读取 Excel → 逐列解析为 Vec<f64>
    │  时间列 → Unix 时间戳 (f64)
    │  数值列 → 直接解析
    │  无法解析列 → 跳过
    │
    ▼
存入 WindowState.raw_data
    │
    ▼
返回列名列表 + 时间范围 → 前端
    │
    ▼
前端渲染 X 轴下拉 + 信号选择弹窗
    │
    ▼
用户选择信号 → 点击"生成图表"
    │
    ▼
Rust: get_series(columns)
    ├── 从 raw_data 提取选中列
    ├── 时间过滤（可选）
    ├── LTTB 降采样至 5000 点
    ├── 断点检测 → 标记 null
    └── 返回 { x: [], series: [{name, y: []}] }
    │
    ▼
前端接收 JSON → ECharts setOption()
    │
    ▼
用户交互（缩放/平移/tooltip）→ 纯前端，无后端调用
```

## 4. Rust 后端设计

### 依赖

| 库 | 用途 |
|----|------|
| `calamine` | Excel 读取（纯 Rust）|
| `serde` / `serde_json` | 序列化 |
| `tauri` v2 | 桌面框架 |
| `uuid` | 窗口 ID 生成 |

### 核心数据结构

```rust
struct AppState {
    windows: HashMap<String, WindowState>,
}

struct WindowState {
    raw_data: HashMap<String, Vec<f64>>,  // col_name → values
    columns: Vec<ColumnInfo>,
    row_count: usize,
}

struct ColumnInfo {
    name: String,
    col_type: ColumnType,  // Time | Numeric | Skip
    min: f64,
    max: f64,
    sample_count: usize,
}
```

### Tauri Commands

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `open_file` | `path`, `inherit_columns?` | `ColumnInfo[]` + `time_range` | 读取 Excel，可选继承信号 |
| `get_series` | `columns`, `time_start?`, `time_end?` | `ChartData` | 降采样回传 |
| `list_windows` | — | `WindowInfo[]` | 列出所有窗口 |

### 降采样 (LTTB)

- 目标点数: 5000
- 时序特征保留: 暂态/峰值不丢失
- 性能: 5 万点 → 5000 点 ≈ 1ms/信号

## 5. 前端设计

### 文件结构

```
frontend/
  index.html       ← 主页面
  static/
    echarts.min.js ← ECharts 核心库
    style.css      ← 浅色工程风格
    app.js         ← 全部前端逻辑
```

### 应用状态 (app.js)

```
UIState:
  columns: ColumnInfo[]        ← Rust 返回的列信息
  selectedXCol: string|null    ← 当前 X 轴
  selectedYCols: Set<string>   ← 选中的信号
  chartData: ChartData|null    ← 已获取的图表数据
  fileLabel: string            ← 当前文件名
  windowId: string             ← 当前窗口 ID
```

### 模块划分 (app.js)

```
TauriBridge       — invoke() 封装
SignalPanel       — X 轴下拉、已选标签、生成按钮
SignalDialog      — 弹窗选择信号（搜索 + checkbox）
EChartsManager    — 图表初始化、更新、销毁
MultiWindow       — 多窗口管理
UIRenderer        — UI 渲染入口
```

### 信号选择弹窗

- 模态弹窗
- 搜索框：输入时实时过滤（`col.name.includes(keyword)`），不区分大小写
- 列表：checkbox + 列名 + 数据范围 min~max
- 底部：已选计数 / 全选 / 清空 / 确定 / 取消
- 打开时默认勾选已选中的信号

### 图表区 (ECharts)

| 功能 | ECharts 配置 |
|------|-------------|
| 缩放/平移 | `dataZoom[{type:'inside'}, {type:'slider'}]` |
| 悬浮数值 | `tooltip: {trigger:'axis', axisPointer:{type:'cross'}}` |
| 多 Y 轴 | `yAxis: [{}, {}, ...]` 每个信号一个 Y 轴 |
| 时间 X 轴 | `xAxis: {type:'time'}` |
| 断线 | `connectNulls: false` |
| 主题 | `'light'` |

## 6. UI 布局

### 主界面

```
┌────────────────────────────────────────────────────────┐
| 菜单栏: 文件(F)  查看(V)  帮助(H)                      |
├────────────────────────────────────────────────────────┤
|                                                        |
| ┌──────────────┐  ┌──────────────────────────────────┐  |
| |  左面板       |  |   图表区                         |  |
| |  (300px)      |  |                                 |  |
| |               |  |   [ECharts 折线图 + 多Y轴]       |  |
| | 📁 test.xlsx  |  |                                 |  |
| |               |  |   ┌─ dataZoom slider ───────┐   |  |
| | X轴: [▼时间列]  |  |   | ◄═══●═══════════════► |   |  |
| |               |  |   └────────────────────────┘   |  |
| | 信号: [选择]  |  |                                 |  |
| |               |  |                                 |  |
| | 已选:         |  |                                 |  |
| | ×BrkPdlPos   |  |                                 |  |
| | ×BMSPackCrnt |  |                                 |  |
| |               |  |                                 |  |
| | [🎨 生成图表] |  |                                 |  |
| └──────────────┘  └──────────────────────────────────┘  |
|                                                        |
| 状态栏: 数据: 2562行×6列  选中: 2个信号                |
└────────────────────────────────────────────────────────┘
```

### 浅色工程主题

| 元素 | 颜色 |
|------|------|
| 页面背景 | `#ffffff` |
| 左面板背景 | `#f5f6f8` |
| 面板分隔线 | `#d0d5dd` |
| 文字主色 | `#1a1a2e` |
| 文字次要 | `#5f6b7a` |
| 按钮主色 | `#2b5fa8` |
| 按钮 Hover | `#1e4682` |
| 输入框边框 | `#d0d5dd` |
| 标签背景 | `#e8f0fe` |
| 标签移除 | `#9aa0a6` |
| 状态栏 | `#e8eaed` |
| 图表网格线 | `#e5e7eb` |
| 字体 | Segoe UI / Microsoft YaHei |
| 数字字体 | Consolas |

## 7. 多窗口方案

### 创建流程

1. 用户点击"文件 → 打开"（或 Ctrl+O）
2. Tauri `WebviewWindow::new()` 创建新窗口
3. 新窗口加载 `index.html?wid=<uuid>`
4. 前端初始化后调用 `open_file(path)`
5. 如果传入了 `inherit_from` 参数，自动勾选对应的信号

### 数据隔离

- 每个窗口独立维护 `WindowState`
- 关闭窗口时自动清理对应 `HashMap` 条目
- 无窗口间通信，完全独立

### 信号继承

- 打开新文件时，前端检查 URL 参数 `inheritColumns=...`
- 如果继承的列名存在于新文件中，自动勾选
- 不存在的列名自动跳过（toast 提示）

## 8. 错误处理

| 场景 | 处理 |
|------|------|
| 文件格式错误 | 弹窗提示，仅支持 .xlsx |
| 文件损坏 | 弹窗"文件无法读取" |
| 无有效时间列 | 提示选择包含时间的列 |
| 无有效数值列 | 提示文件无可用数据 |
| 选中信号不存在（继承） | toast 提示跳过 |
| 超过 20 个信号 | 限制提示 |
| IPC 调用失败 | catch 后弹窗重试提示 |
| 超大文件（>500MB） | 拒绝加载提示 |
| 空图表状态 | 占位文字"请选择信号并生成图表" |

## 9. 开发计划

### 阶段一：项目初始化与核心数据流
1. Tauri 项目脚手架搭建
2. Rust 端：Excel 读取 + 数据结构 + IPC 命令
3. 前端：基础布局（左面板 + 图表区）

### 阶段二：信号选择与图表
1. 信号选择弹窗 + 模糊搜索
2. 已选标签展示 + 单个移除
3. ECharts 集成 + 多 Y 轴折线图
4. dataZoom + tooltip 交互

### 阶段三：多窗口与收尾
1. 多窗口创建与切换
2. 信号继承逻辑
3. 错误处理全覆盖
4. Windows 打包测试
