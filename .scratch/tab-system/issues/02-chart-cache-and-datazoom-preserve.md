# 02 — 图表缓存 / Tab 切换保留缩放和记号

**What to build:** 切换 tab 时自动缓存当前 tab 的图表数据（chartData、dataZoom 位置、记号标记）。切回时直接渲染缓存，不调用后端，缩放位置和记号完整保留。

**Blocked by:** 01 — Tab 系统：多 Session 状态 + Tab 栏 + 打开/关闭

**Status:** ready-for-agent

- [ ] 每个 `SessionState` 添加缓存字段：`chartData`、`dataZoom: { start, end }`、`markers`
- [ ] 切出 tab 时自动快照当前 ECharts `dataZoom.start/end` 存入 session
- [ ] 切入 tab 时检查 session 是否有缓存 `chartData`；有则直接渲染（不调 `get_series`），无则调 `get_series` 生成
- [ ] 还原 dataZoom 缩放位置到 ECharts 实例
- [ ] 还原记号标记
- [ ] 重新生成图表时（如新增信号）更新缓存
