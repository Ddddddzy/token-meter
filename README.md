# Token Meter

Windows 本机 Agent token 用量统计工具。只有系统托盘小窗，没有独立网页版；不需要配置 API Key。

<img src="assets/token-meter.png" width="96" height="96" alt="Token Meter icon">

## 功能与开发状态

- 已实现：今日 / 7 天 / 30 天 / 全部，按 Agent 与模型分组，趋势图、费用折算、模型明细。
- 已实现：单滚动区域、长名称换行、80%–140% 缩放、平滑切换与展开动画、玻璃不透明度设置。
- 小窗底边固定，打开时向上展开、收起时向下折叠（约 240ms）：原生窗口区域逐帧裁切，不平移、不淡入淡出，也不拉伸文字或反复重排内容，支持快速反向操作；第一次打开等待 WebView2 准备完成。收起按钮使用向下箭头，减少动画设置会跳过动效。
- 图标为白底黑色三根递增信号条，托盘与面板使用同一简约样式。
- 磨砂背景沿用本机背景采样，但先进行三次分离盒式模糊（高斯近似）再送入 WebView2，额外设置独立模糊层、文字对比色层与边缘高光；降低不透明度也不会让背景文字恢复清晰。滑条只调玻璃色层，不降低前台文字不透明度。
- 已实现：本机数据路径自动发现、配置文件覆盖、当前用户登录自启、多尺寸托盘图标。
- **待开发：按设备分类。** 目前只扫描本机；没有远程设备采集、历史数据导入、同步或跨设备去重。设备按钮明确禁用，API 的主机名字段仅保留作未来扩展，不能当作已支持多设备。
- 待开发：Cursor 精确用量接入、GUI 编辑数据路径、打包安装器，以及更多日志版本的兼容验证。

## 支持的 Agent

`~` 表示当前 Windows 用户目录，`%APPDATA%` 表示当前用户的漫游应用数据目录。没有安装的 Agent 或不存在的数据目录会跳过，不要求六种工具全部安装。

| Agent | 默认本地来源 | 统计方式与边界 |
| --- | --- | --- |
| Codex CLI / Desktop | `~/.codex/sessions`、`archived_sessions` | 读取实际 usage；兼容新版逐请求记录与旧累计日志，处理重复、fork 与子代理；尊重 `CODEX_HOME` |
| Claude Code | `~/.claude/projects` | JSONL assistant usage；流式快照、resume/fork 按消息与请求去重；尊重 `CLAUDE_CONFIG_DIR` |
| Command Code / cmdc | `~/.commandcode/projects` | Claude-like JSONL；按其“输入含缓存”的口径处理，不等同于 Claude 的输入定义 |
| opencode | `~/.local/share/opencode/opencode.db` | SQLite `message.data` 中逐条 tokens/cost/modelID；尊重 `XDG_DATA_HOME`；未支持其他存储格式 |
| Devin CLI | `%APPDATA%/devin/cli/sessions.db` | SQLite `message_nodes` 的 metrics，按 request_id / message_id 去重；缺失 metrics 时仅保留日志提供的输出计数 |
| Cursor | `%APPDATA%/Cursor/User/globalStorage/state.vscdb` | **估算**：按文本、工具内容和上下文重放计数，不是官方账单，也不保证覆盖其他数据库或版本；`~/.cursor/ai-tracking/ai-code-tracking.db` 仅提供辅助请求/模型信息 |

模型名称取自日志，支持 Agent 不代表固定只支持某几款模型，也不代表所有模型都能准确计价。此工具不统计 ChatGPT 网页、手机端或未写入上述本地来源的其他设备用量。

## 安装与启动

当前托盘实现仅面向 **Windows x64**，需要：

1. Node.js 22.13+ 或支持 `node:sqlite` 的更高版本，推荐安装 [Node.js LTS](https://nodejs.org/)。后端仅使用 Node 内置模块，不需要 `npm install`。旧说明中的 22.5 太低：SQLite 到 [22.13 才默认开放](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html)，启动脚本也会实际检查模块可用性。
2. Windows PowerShell 5.1 / .NET Framework 4.6.2+。
3. [Microsoft Evergreen WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。仅安装 Edge 浏览器不等同于此依赖。
4. WebView2 SDK DLL。它与 Runtime 是两回事；初始化脚本从官方 NuGet 下载固定版本 `1.0.4191.47` 并核对固定 SHA512，SDK 不上传到 Git。

```powershell
git clone https://github.com/Ddddddzy/token-meter.git
cd token-meter
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup.ps1
```

然后双击 **`token-meter.vbs`**。它是唯一日常启动入口，静默调用 `scripts/start.ps1`，检查依赖与配置后打开托盘小窗；重复启动不会创建第二个实例。托盘左键显示/收起，右键退出，Escape 或点击窗外收起。

旧 `启动.bat` 直接启动 PowerShell，旧 `使用.bat` 再转调 VBS，二者功能重复，现已删除。若已有快捷方式指向 BAT，请改为 `token-meter.vbs`，图标可选 `assets/token-meter.ico`。

首次安装 SDK 需要网络；后续正常运行不需要联网下载依赖。离线迁移可以复制已安装的 `lib/webview2/pkg`，但新设备仍需安装 Node.js 和 WebView2 Runtime。SDK/Runtime 的区别见 [微软文档](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)。

## 登录自启

```powershell
# 初始化依赖，并启用当前用户登录自启
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup.ps1 -AutoStart

# 只取消本程序的自启，不删除代码、配置或 Agent 日志
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup.ps1 -RemoveAutoStart
```

自启写入 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\TokenMeter`，不要求管理员权限。启动命令使用当前项目的绝对路径与 `--background`，登录后只显示托盘，不自动弹出小窗。**移动项目目录或换设备后，需重新运行 `setup.ps1 -AutoStart`**；Git 不会迁移 Windows 注册表。

## 配置与跨设备迁移

无配置时自动使用当前设备、当前用户的默认路径，不依赖作者的用户名、盘符或代理。

需要自定义时，将 `config.example.json` 复制为 **`config.json`**，按需修改：

```json
{
  "port": 3080,
  "sources": {
    "codex": "./agent-data/codex",
    "claude": "%USERPROFILE%/.claude/projects",
    "opencode": null,
    "cursor": false
  }
}
```

- 配置键：`cmdc`、`codex`、`claude`、`opencode`、`devin`、`cursor`、`cursorTracking`。
- `null`、空字符串或未填写：用当前设备默认路径；`false`：禁用此数据源。禁用 `cursor` 也跳过它的辅助 tracking 库。
- `codex` 填 `.codex` 根目录，不是 `sessions` 子目录；Claude / cmdc 填 `projects` 目录；SQLite 来源填完整数据库文件路径。
- 相对路径以**配置文件所在目录**为基准，与从哪里启动无关；支持 `~/` 与 `%环境变量%`。JSON 内 Windows 反斜杠需写成 `\\`，也可使用 `/`。
- `TOKEN_METER_CONFIG` 可指定外部配置文件；相对配置文件名以项目根目录为基准。
- `TOKEN_METER_PORT` 优先于 JSON 的 `port`。显式 `sources` 优先于 Agent 的环境变量，再回退默认路径。
- 配置在启动时读取，修改来源/端口后需要右键退出再启动。无效 JSON、未知来源或无效端口会明确报错，不会静默忽略。
- 小窗齿轮目前只编辑窗口大小与玻璃不透明度，保存到项目目录的 `ui-settings.json`；向左更通透、向右更沉稳，基础磨砂与文字对比色层始终保留。数据路径是只读展示，附带已发现 / 不存在 / 已禁用状态。

迁移建议：

1. 在另一台 Windows x64 设备克隆仓库，安装依赖并运行 `setup.ps1`。
2. 默认路径一般无需复制配置；需要时复制 `config.json`，把写死的旧机器绝对路径改为新路径、相对路径或用户环境变量。
3. 想保留界面偏好可复制 `ui-settings.json`；它与 `config.json` 都被 Git 忽略，不会随仓库同步。
4. Agent 历史日志不会随项目迁移。新设备默认只统计自己的日志；如手动复制日志，请指向单一整理后的来源，这不等于支持多设备合并。
5. 在新位置重新启用自启，不要复制旧注册表命令。请将项目放在当前用户可写目录，避免放进受保护的 Program Files。

WebView2 缓存位于 `%LOCALAPPDATA%/token-meter/webview`，无需迁移；启动失败日志在同目录的 `startup.log`。

## Token 与费用口径

Codex 新版逐请求 `token_usage_record` 优先，按 `response_id` 跨文件去重；对应重复 `token_count` 不再相加。旧累计日志保留峰值、乱序、重启与 fork 水位处理；fork 基线只取分叉点前的父会话水位，子代理独立计数，模型按当次事件归属。

Codex 的缓存是输入子集，推理是输出子集；总量为输入＋输出，不重复添加。当前 Codex 会话请求完成且 usage 落盘后才会显示，不估算正在生成但尚未记录的部分，也不表示账户剩余额度。

小窗可见时约每 5 秒刷新；其他来源每分钟扫描，Cursor 大库最多每 15 分钟自动重扫，刷新按钮强制重扫。完整扫描耗时随本地历史大小变化，Cursor 后台结果可能稍后更新。

费用优先使用日志提供的网关金额，否则根据代码内价格与 `model_prices.json` 快照折算；部分来源采用参考费率或估算 token，界面会标记 `≈`。未知价格的模型保留 token，但不计入已知费用。**这些数字不是 ChatGPT 订阅扣款，也不是所有平台的正式账单**，快照不会自动联网更新。

OpenAI 计价参考：[GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)、[Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)。不同 Agent 的 usage 字段含义并不完全相同，由各扫描器分别处理。

## 文件结构

```text
token-meter/
├─ token-meter.vbs          唯一日常启动入口
├─ tray.ps1                 Windows 托盘 / WebView2 原生外壳
├─ panel.html               唯一小窗界面
├─ server.mjs               六类数据扫描、聚合、本地 API
├─ config.mjs               配置读取与路径解析
├─ config.example.json      可复制的配置模板
├─ model_prices.json        离线价格快照
├─ server.test.mjs          统计 / 去重 / 日期 / 价格测试
├─ config.test.mjs          路径迁移与配置测试
├─ scripts/
│  ├─ setup.ps1             SDK 初始化、登录自启开关
│  ├─ start.ps1             依赖检查、错误提示、启动托盘
│  ├─ build-icon.ps1        重建多分辨率 ICO
│  ├─ test-glass.ps1        合成图像模糊与动画曲线测试
│  ├─ verify.py             旧 TokenBar 独立参考，不是当前 Windows 全量验收
│  └─ devin_compare.py      Devin 去重证据检查，可用 --db 指定数据库
├─ assets/                  ICO / PNG / SVG 图标
├─ native/GlassEffects.cs    本机背景磨砂算法、窗口动效曲线
├─ licenses/                第三方授权说明
└─ lib/webview2/pkg/         本机安装的 SDK（Git 忽略）
```

本机配置、界面偏好、日志、诊断输出、依赖和截图不入版本控制。旧 `backdrop.png` 已移除；背景采样只在本机内存中通过 loopback 服务传给小窗，不再保存为仓库文件。

## 开发与验证

```powershell
node --check server.mjs
node --test server.test.mjs config.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-glass.ps1
node server.mjs --audit

# 前台启动检查（便于看错误）
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1 -Show
```

后端仅监听 `127.0.0.1`，默认端口 3080，不开放远程采集。`/panel` 是小窗内部页面；根路由 `/` 返回 410，独立网页版已删除。`/api?range=day|7d|30d|all` 返回统计，`/api/ui` 读写界面偏好并提供只读来源信息。

`tray.ps1` 保持 UTF-8 BOM，兼容 Windows PowerShell 5.1。不要把真实 Agent 日志、个人配置或桌面截图提交到仓库。旧 TokenBar 算法、价目快照与参考脚本的第三方 MIT 授权见 `licenses/TokenBar-LICENSE.txt`；参考脚本包含旧平台/旧日志假设，不作为当前 Codex Desktop 支持范围的证明。
