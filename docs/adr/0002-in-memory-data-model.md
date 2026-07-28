# ADR-0002: In-memory full-data model per Window

Each Window loads the entire source file into memory as `HashMap<String, Vec<f64>>` — one `Vec<f64>` per signal column. No lazy loading, no pagination, no streaming.

This was the simplest correct starting point, matching the typical data size in automotive signal files: tens of MB, hundreds of thousands of rows, a few dozen signals. At this scale the full dataset fits comfortably in RAM (a 300 MB CSV compresses to ~200 MB of `f64` vectors in Rust) and the simplicity of random-access lookup pays off for signal arithmetic and marker computation.

The trade-off is an O(n) memory ceiling per file. Future work may add a virtualized renderer that requests data in chunks, but the current approach is correct for the target data profile and avoids the complexity of a tiling/caching layer before the application proves it needs one.

A rejected alternative was SQLite-backed storage — it would have added a build dependency and a query translation layer without measurable benefit at current data sizes.
