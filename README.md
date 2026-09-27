# token-meter

本机 Agent CLI token 用量统计工具：扫描各 CLI 的本地记录 → 统一计价 → Web 仪表盘 + 原生托盘小窗。

## 运行

```powershell
python player.py            # 不是这个仓库的，看下面
使用.bat                     # 静默启动托盘小窗（内部调 token-meter.vbs → tray.ps1）
token-meter.vbs             # 完全静默入口，推荐
```

启动后托盘出现「T」图标，左键弹出小窗；浏览器完整版在 <http://127.0.0.1:3080>。

## 组成

| 文件 | 作用 |
|---|---|
| `server.mjs` | Node ≥22.5 单文件服务端：扫描器 + 定价层 + HTTP API + 网页仪表盘，零依赖（SQLite 用内置 `node:sqlite`） |
| `tray.ps1` | 原生 WinForms 托盘小窗（无边框圆角、失焦自动收起），检测 3080 未监听时自动以隐藏窗口拉起 `node server.mjs` |
| `token-meter.vbs` / `使用.bat` | 静默启动入口 |
| `backdrop.png` | 小窗毛玻璃背景采样底图 |

## 数据源

cmdc / Codex / Claude Code / opencode(DB) / Devin CLI / Cursor 的本地用量记录；所有 SQLite 均**复制 db+wal+shm 到临时目录再打开副本**，扫完删除，避免 WAL 读锁让写入方 `SQLITE_BUSY`。

去重规则（移植自 TokenBar 的实测结论）：

- **Devin**：`message_nodes` 是 DAG，同条消息存 2~7 份，按 `(session, request_id/message_id)` 去重（本机实测朴素求和虚高 2.39x）；模型取 `metadata.generation_model`，时间取 `metadata.created_at`；`swe-2-*` 合并为 `swe-2`
- **Claude / cmdc**：流式递增快照，按 `message.id:requestId` 跨文件去重取字段最大值（claude 实测虚高 ~1.34x，cmdc 无重复）
- **Codex**：`total_token_usage` 累计值谱系算法——峰值闸门拦重放、fork 文件从父会话水位起步、`last` 超限回退分量差、计数重启只在 `last==新累计` 时认；同时扫 `sessions/` 和 `archived_sessions/`

计价三档：**网关记账** / **标价** / **估算**，无公开价的模型明确标注，模型名带 `free` 按 $0。价格表优先级：`server.mjs` 顶部 `LIST`（本机新模型）→ `model_prices.json`（LiteLLM 快照 4147 个，精确匹配）→ `PROXY`（借价，标估算）；`FAST` 处理 *-fast 变体。

## 改代码注意事项

- `tray.ps1` 必须保存为 **UTF-8 带 BOM**，否则 PowerShell 5.1 按 GBK 解析中文字符串直接语法错误
- 不要用 PowerShell `Set-Content` 重定向写含中文的文件（会把 UTF-8 无 BOM 文件写成 GBK 乱码并丢引号），用编辑工具
- PS 5.1 事件闭包别用 `.GetNewClosure()`；`New-Object Drawing.Font` 不认 `'Bold'` 字符串
- 托盘小窗启动时已调 `SetProcessDPIAware()`，否则文字发虚

## 迁移到新机器

需求：**Windows + Node ≥22.5**（用到 `node:sqlite`）。克隆后：

1. 只要网页仪表盘 → 直接 `node server.mjs`，开 `http://127.0.0.1:3080`
2. 要托盘小窗 → 额外装 WebView2 NuGet 包到 `lib/webview2/pkg/`（`pkg.zip` 就是压缩包，项目里留有参考；或 `nuget install Microsoft.Web.WebView2`），再跑 `使用.bat`
3. 各 CLI 数据源目录不存在会自动跳过，没有对应 CLI 也能跑

## 未纳入版本控制

`lib/`（WebView2 SDK 约 54MB）、`_tray_err.txt`、`ui-settings.json`（本机 UI 偏好）。

## 致谢

去重/谱系算法、`model_prices.json` 价目表、`verify.py`/`devin_compare.py` 移植自 [betacatsling/TokenBar](https://github.com/betacatsling/TokenBar)（MIT，见 `licenses/TokenBar-LICENSE.txt`）。

完整设计与踩坑记录见知识库《2026-09-22 Token Meter 本地用量统计》报告。
