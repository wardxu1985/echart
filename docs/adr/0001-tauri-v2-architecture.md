# ADR-0001: Tauri v2 + Rust + Native JS frontend

signal-viewer uses Tauri v2 as its desktop shell, with a Rust backend for file I/O and data processing, and a native (no framework) HTML/JS frontend using ECharts for charting.

Tauri v2 was chosen over Electron for the much smaller binary size and lower memory footprint — important for an automotive tool that may run alongside data-collection software on modest hardware. The Rust backend handles the performance-critical path (Excel/CSV parsing, large-vector operations) that would be impractical in a purely web-based frontend. Native JS (no React/Vue) keeps the bundle minimal and avoids framework churn on a UI that is predominantly a charting surface with simple dialogs.

The alternative — Go backend + React frontend in Electron — was rejected because it would double the binary size and add a language boundary (Go → WASM or Go gRPC) for data transfer. Tauri's built-in IPC (`invoke`) gives zero-copy-ish serialization between Rust structs and the frontend.
