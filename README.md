# Token Meter

本机 Agent token 用量统计工具。只保留 Windows 托盘小窗；本地 HTTP 服务用于 WebView2 和数据 API。

## 启动

双击 `token-meter.vbs` 或 `使用.bat`。托盘 T 图标左键显示/收起小窗，右键退出。Escape 或点击窗外收起。

需要 Windows、Node ≥22.5，以及 `lib/webview2/pkg/` 下的 WebView2 SDK。已有静默入口和桌面快捷方式继续可用。

## 小窗

- 今日 / 7 天 / 30 天 / 全部；按 CLI / 模型 / 机器查看。
- 趋势图随范围变化：小时 / 天 / 月；柱子总量与顶部数字一致。
- 点击 CLI 展开模型明细；Codex 额外显示输入、缓存、输出和推理 token。
- 分段按钮滑动指示器、列表变换、详情展开、数字和图表使用约 460ms 平滑过渡；尊重系统减少动画设置。
- 单一纵向滚动区域。名称完整换行、数值分行布局，80%–140% 缩放可用。
- 齿轮打开小窗内设置：窗口大小、背景不透明度、数据来源路径。设置保存到 `ui-settings.json`。
- 小窗可见时每 5 秒读取最新用量；其他来源每分钟更新，Cursor 大库最多每 15 分钟自动重扫。刷新按钮立即重新扫描。

## 数据口径

cmdc / Codex CLI 与 Desktop / Claude Code / opencode / Devin / Cursor。SQLite 先复制 db、wal、shm，再只读副本。

Codex 支持默认 `~/.codex` 和 `CODEX_HOME`，扫描 sessions 与 archived_sessions：

1. 新版 `token_usage_record` 的逐次 usage 优先，按 response_id 跨文件去重。
2. 对应的重复 token_count 不再相加。旧版累计日志仍使用峰值、乱序、重启和 fork 水位处理。
3. fork 使用分叉点前的父会话水位；父会话后来的用量不影响子会话。子代理使用独立计数。
4. 模型按当时 turn_context/实际用量事件归属，兼容会话内切换模型。
5. 缓存读/缓存写是输入子集，推理是输出子集；token 总数为输入+输出，避免重复。
6. 当前聊天的用量会在一次模型请求完成、记录落盘后出现。不会估算尚未完成的生成。

费用为本地用量按公开 API 价折算的估价，不是 ChatGPT 订阅扣款。GPT-6.1 Sol 标准费率每百万输入 $2、缓存读 $0.10、输出 $10、缓存写 $2.50；超过 272K 输入的请求按长上下文费率处理。只有日志明确记录 Fast/Priority 时才乘相应倍率。无公开价格的模型保留 token，标注待定价。

价格来源：[GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)、[Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)。其他模型保留原 LIST、LiteLLM 快照和 PROXY 借价配置。

## 开发与检查

`server.mjs` 是扫描器、聚合和 loopback-only API；`panel.html` 是唯一 UI；`tray.ps1` 是 WinForms/WebView2 外壳。

```powershell
node --check server.mjs
node --test server.test.mjs
node server.mjs --audit
```

根路由 `/` 返回 410，网页版已删除；`/panel` 只承载托盘界面。`/api?range=day|7d|30d|all` 返回统计，`/api/ui` 读写小窗设置。开发端口可通过 `TOKEN_METER_PORT` 覆盖。

`tray.ps1` 必须是 UTF-8 带 BOM，兼容 Windows PowerShell 5.1；不要整文件用 Set-Content 重写。托盘单实例，并且窗口大小限制在当前显示器工作区域内。

原有 TokenBar 去重算法、价格快照和独立核查脚本沿用 MIT 授权，见 `licenses/TokenBar-LICENSE.txt`。本机状态、SDK 和运行日志不入版本控制。
