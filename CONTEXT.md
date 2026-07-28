# echart — signal-viewer

A desktop signal viewer for automotive CAN data (CANape-style), built with Tauri v2.

## Language

### Signal
A named time-series of numeric measurements from a vehicle data file (Excel or CSV). Each Signal has a name (e.g. "车速", "发动机转速") and a sequence of `(timestamp, value)` pairs.
_Avoid_: Channel, Column, Series, Variable

### Column
A raw data column in the source file. Columns are classified into **Time**, **Numeric**, or **Skip** at parse time. Time and Numeric Columns produce Signals.
_Note_: "Column" is a data-layer concept; the domain concept presented to users is "Signal".

### Time Column
A Column whose values are parsed as timestamps. Detection uses keyword matching (time, event, 时间, 日期) then attempts to parse as Excel serial date, Unix timestamp, or datetime string. All are normalized to Unix timestamps (seconds since epoch, UTC with local-timezone offset applied).

### Numeric Column
A Column whose values can be parsed as numbers (including suffixed units like "100V", "10.5kW"). Columns with < 50% numeric parse ratio are skipped.

### Window
An independent document context holding one file's data (raw signals + metadata). Each Window is created by opening a file and has its own ID. Multiple Windows can coexist, displayed in separate OS windows.

### Signal Arithmetic
Server-side per-element arithmetic between two signals of equal length. Currently supports addition (`+`) and subtraction (`-`). The result is a new derived signal stored in the same Window.

### Marker
A user-placed annotation at a specific timestamp, recording the value of every visible signal at that instant. Markets enable cross-signal comparison at multiple time points.

### Gap
A discontinuity in a signal's time series caused by recording gaps. Detected by comparing each interval to the median interval times a multiplier (default 3×). Data points after a gap are rendered with a null-break to prevent misleading visual connections.

### VIN (Vehicle Identification Number)
A unique identifier string extracted from the source file. Located by scanning column headers for keywords (VIN, 车架号, 底盘号, 底盘, 车辆识别). The first non-empty value found is displayed in a banner.

### Downsampling
Reducing data point count for visualization while preserving visual shape. ECharts' built-in Largest Triangle Three Buckets (LTTB) algorithm is used at render time. The Rust-side LTTB implementation in `downsample.rs` is dead code superseded by the ECharts native solution.
_Avoid (for this purpose)_: Server-side downsampling
