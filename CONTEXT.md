# echart — signal-viewer

A desktop signal viewer for automotive CAN data (CANape-style), built with Tauri v2.

## Version History

### v0.6.0 (2026-09-03)
- **Fix: Sparse signals no longer skipped** — Column parse ratio now uses the count of *non-empty* cells as its denominator instead of the total row count. Signals that are only sampled within event windows (e.g. `VehSpdAvg`, `BrkPdlPos`, `SCUShiftrLvrPosnbkp` in non-event-collection exports, where ~48% of rows are blank) were previously misclassified as non-numeric and hidden from the signal list. Empty cells no longer penalize the parse ratio, so these sparse-but-fully-numeric columns are now recognized as Numeric signals. Applies to both Excel and CSV parsing.

### v0.5.1 (2026-08-20)
- **Fix: Tab switching restores file name and VIN** — When switching between tabs, the file name label and vehicle identification number (VIN) banner now correctly reflect the active session's data instead of always showing the last opened file.

### v0.5.0 (2026-08-19)
- **Fix: Gap detection for multi-rate data** — Added an absolute minimum gap threshold (60s) to the gap detection algorithm. Previously, when a file contained mixed sampling rates (e.g., 1s dense + 10s sparse), the global median was skewed by the dense data, causing all sparse intervals to be falsely detected as gaps.
- **Feature: Date range filter** — Users can now filter the chart by selecting a date range. The filter is applied server-side before rendering.
- **Fix: Tauri v2 camelCase parameter passing** — Fixed a bug where `time_start`/`time_end` were passed as snake_case to Tauri IPC, causing the backend to always receive `None`.

### v0.4.0
- Initial version with multi-session tab system, signal arithmetic, marker annotations, RTM analysis.

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
A discontinuity in a signal's time series caused by recording gaps. Detected by comparing each interval to the median interval times a multiplier (default 3×), with an absolute minimum threshold of 60 seconds. The absolute threshold prevents false positives when files contain mixed sampling rates (e.g., 1s + 10s). Data points after a gap are rendered with a null-break to prevent misleading visual connections.

### Date Range Filter
A user-selectable time window that restricts chart display to a subset of the data. The user enters start/end timestamps in `YYYY-MM-DD HH:MM:SS` format and clicks "确认" to apply. The filter is applied server-side in the `get_series` command (via `time_start`/`time_end` parameters) before data is sent to the frontend. The UI stores a `dateRangeConfirmed` flag to prevent the filter from being reset during session switches.

### VIN (Vehicle Identification Number)
A unique identifier string extracted from the source file. Located by scanning column headers for keywords (VIN, 车架号, 底盘号, 底盘, 车辆识别). The first non-empty value found is displayed in a banner.

### Downsampling
Reducing data point count for visualization while preserving visual shape. ECharts' built-in Largest Triangle Three Buckets (LTTB) algorithm is used at render time. The Rust-side LTTB implementation in `downsample.rs` is dead code superseded by the ECharts native solution.
_Avoid (for this purpose)_: Server-side downsampling
