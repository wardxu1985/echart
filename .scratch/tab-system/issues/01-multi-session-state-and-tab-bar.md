# 01 — Tab 系统：多 Session 状态 + Tab 栏 + 打开/关闭

**What to build:** 在同一个窗口内用标签页支持同时打开多个文件。每个 tab 独立持有自己的文件数据、信号选择、运算结果、合并组信息。切换 tab 时左面板和图表区跟随切换。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 全局 `state` 改为 `sessions: { [sessionId]: SessionState }` + `activeSessionId`。每个 `SessionState` 独立持有 `windowId`、`columns`、`numericColumns`、`selectedXCol`、`selectedYCols`、`signalGroups`、`fileLoaded`、`timeRange`、`vin`
- [ ] Tab 栏 UI：菜单栏下方新增 Tab 栏，显示已打开的文件名。当前激活的 tab 高亮
- [ ] 添加 tab：点击 Tab 栏右侧 `+` 按钮 → 弹出文件选择器 → 调用后端 `open_file` → 创建新 session → 激活新 tab。新 tab 继承当前激活 tab 的 `selectedYCols`
- [ ] 关闭 tab：每个 tab 右侧有 `×` 按钮 → 调用后端 `close_window` → 删除 session。最少保留一个 tab
- [ ] 切换 tab：点击另一个 tab → `activeSessionId` 更新 → 左面板数据切换到该 session → 调用 `get_series` 渲染图表
- [ ] 打开文件：菜单栏"打开文件"改为在当前激活 tab 内替换文件，不创建新 tab
- [ ] 移除多窗口：移除"以新窗口打开"菜单项及其后端代码（`create_window`、`get_pending_file`、`PendingFileData`）
- [ ] 后端清理：移除 `create_window`、`get_pending_file` 命令，清理 `state::PendingFileData`、`state::AppState.pending_file`
- [ ] 前端文件：`app.js` 状态模型重构 + Tab 栏 DOM 和事件；`dialog.js` 所有 `state.selectedYCols` 改为 `currentSession().selectedYCols`；`index.html` 添加 Tab 栏 HTML；`style.css` Tab 栏样式
- [ ] 新 tab 加载期间显示 loading overlay，动画和现有行为一致
- [ ] 最后确认 Windows 上 tab 功能正常工作
