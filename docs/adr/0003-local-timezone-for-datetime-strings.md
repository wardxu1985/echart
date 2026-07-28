# ADR-0003: Local-timezone offset for datetime string timestamps

When a CSV or Excel date-time string (e.g. `"2024-01-01 08:00:00"`) is parsed, it is treated as **local time** (the machine's timezone) and converted to a Unix timestamp by subtracting the local UTC offset.

This was chosen over always treating un-annotated datetime strings as UTC because automotive signal files are typically recorded by data loggers configured to the local workshop/vehicle timezone. Treating them as UTC would shift the displayed timestamps by the local offset (e.g. +8 hours for CST), making them wrong for the primary user workflow of comparing logged timestamps against the original file.

The consequence is that the same file opened on machines in different timezones will produce different Unix timestamps. This is correct behavior for the primary use case (local workshop debugging) but would be wrong for a shared-timeline scenario. If multi-site timezone-aware collaboration is added in the future, the file format should carry an explicit timezone annotation; until then, local-timezone interpretation is the pragmatic default.
