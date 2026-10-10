# Token Meter

Windows 本机 Agent token 用量统计工具。只有系统托盘小窗，没有独立网页版；不需要配置 API Key。

<img src="assets/token-meter.png" width="96" height="96" alt="Token Meter icon">

## 功能与开发状态

- 已实现：今日 / 7 天 / 30 天 / 全部，按 Agent 与模型分组，趋势图、费用折算、模型明细。
- 已实现：单滚动区域、长名称换行、80%–140% 缩放、平滑切换与展开动画、独立的玻璃不透明度与模糊度设置。
- 列表按信息块身份协调动画：同一 Agent / 模型跨时间范围保留原节点，数字和占比条平滑更新；新增块上浮淡入（320ms）、移除块下沉淡出（220ms），分别错开 45ms / 30ms（延迟有上限），排序改变则按原位置滑动（360ms）。速度使用缓入缓出曲线，不再整版一起淡出淡入。Agent 与模型使用不同身份键，不因同色而变形；展开的模型明细也遵循保留、新增、移除的规则。
- 快速切换从当前屏幕位置与数字继续，不从上一目标值重播；保留时间范围切换前的展开状态和键盘焦点。自动刷新只更新真正变化的对象，不主动滚动小窗；减少动画偏好会立即完成变化。
- 小窗底边固定，打开时向上展开、收起时向下折叠（约 240ms）：原生窗口区域逐帧裁切，不平移、不淡入淡出，也不拉伸文字或反复重排内容，支持快速反向操作；第一次打开等待 WebView2 准备完成。收起按钮使用向下箭头，减少动画设置会跳过动效。
- 图标为白底黑色三根递增信号条，托盘与面板使用同一简约样式。
- 小窗使用与原生圆角一致的完整细勾线框：浅色模式为淡灰轮廓，深色模式为浅亮轮廓，四边连续，便于与桌面背景区分；内侧保留轻微玻璃高光。轮廓仅覆盖边缘，不拦截点击、不影响文字布局，也不增加背景模糊或持续动画。
- 磨砂背景在独立后台线程采样、三次分离盒式模糊（高斯近似）与编码，界面不等待截图或统计服务；约每 200ms 检查背景变化，双图层 160ms 平滑交替，静止背景不重绘。预模糊图片直接从内存送入 WebView2，不再通过 HTTP 上传，也不重复执行浏览器模糊；开合与缩放时暂停替换背景，隐藏后停止刷新。保留文字对比色层与边缘高光。
- 设置中的“玻璃模糊度”支持 0%–100%（默认 50%，沿用原效果）：向左更清晰、向右更柔和，0% 不加磨砂模糊；实时生效并保存到本机 `ui-settings.json`，下次启动恢复。它与“玻璃不透明度”互相独立，两者都不影响前台文字清晰度；旧偏好文件自动补齐默认模糊度。
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
git clone https://github.com/Disc13/token-meter.git
cd token-meter
.\deploy.bat
```

双击 **`deploy.bat`** 一键检查依赖、初始化 SDK、启用当前用户登录自启，并立即后台启动。无需管理员权限；它会等待托盘就绪信号（最多 30 秒），失败时保留错误信息，不会直接报告成功。Node.js / WebView2 Runtime 缺失时按提示安装后再运行；不偷偷安装系统软件。命令行可用 `deploy.bat --no-pause`。仅初始化、不启用自启可运行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup.ps1`。

日常启动双击 **`token-meter.vbs`**，静默调用 `scripts/start.ps1`，检查依赖与配置后打开托盘小窗；重复启动不会创建第二个实例。托盘左键显示/收起，右键提供截图模式及退出，Escape 或点击窗外收起（截图模式例外）。自启与一键部署只显示托盘、不弹窗；图标可能在任务栏的隐藏图标区域。

旧 `启动.bat` / `使用.bat` 功能重复，已删除。新的 `deploy.bat` 仅负责安装配置，不是重复的日常启动入口。若旧快捷方式指向已删除的 BAT，请改为 `token-meter.vbs`，图标可选 `assets/token-meter.ico`。

首次安装 SDK 需要网络；后续正常运行不需要联网下载依赖。离线迁移可以复制已安装的 `lib/webview2/pkg`，但新设备仍需安装 Node.js 和 WebView2 Runtime。SDK/Runtime 的区别见 [微软文档](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)。

## 登录自启

```powershell
# 初始化依赖，并启用当前用户登录自启
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup.ps1 -AutoStart

# 只取消本程序的自启，不删除代码、配置或 Agent 日志
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup.ps1 -RemoveAutoStart
```

自启写入 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\TokenMeter`，不要求管理员权限；直接运行系统 Windows PowerShell 的 `scripts/start.ps1`（绝对路径、STA、隐藏窗口），不再依赖 VBS / Windows Script Host。安装会读取并核对注册值，重置仅本程序的旧禁用标记；不会改动其他应用的自启。注册命令超过 Windows Run 的 260 字符限制时明确报错，请缩短安装路径。重复的后台启动不会唤起已有小窗。

**移动项目目录或换设备后，重新运行 `deploy.bat`**；Git 不会迁移 Windows 注册表。这里是“当前用户登录后启动”，不是未登录时运行的系统服务。若没有看到小窗，先检查隐藏托盘图标；`%LOCALAPPDATA%\token-meter\startup.log` 会记录启动、依赖检查、托盘就绪或失败原因。部署即时启动成功不等于已经验证下一次登录；实际登录验证需注销重登或重启后检查托盘与日志。

## 截图兼容

动态玻璃采样平时将小窗排除在屏幕捕获之外，避免采到自己形成递归残影（Windows [SetWindowDisplayAffinity](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity)）。截图时需要暂时取消排除，并冻结当前玻璃背景。

- 小窗打开时，`Win+Shift+S`、`PrintScreen`、`Alt+A` / `Ctrl+Alt+A` 会自动进入截图模式，适配 Windows 及微信 / QQ 常见截图快捷键。快捷键仍原样传给截图工具，不会被拦截。
- 自动截图模式识别 Windows / 微信 / QQ 的截图覆盖窗口：框选与编辑期间不因窗外鼠标选择而收起、不刷新玻璃背景；覆盖窗口退出后短暂等待 250ms，自动恢复，之后点击窗外仍正常收起。完成截图后直接点击其他位置也可收起，无需先点回小窗。覆盖窗口持续存在时没有固定超时；未识别到截图覆盖窗口的快捷键在 10 秒后解除，避免取消截图后永久冻结。
- 如果修改了截图快捷键、从截图工具按钮启动、快捷键钩子被安全软件禁用，或启动工具后仍漏拍，请先右键托盘 → **手动截图模式（点回小窗恢复）**，再使用原来的截图工具；无需安装额外工具。手动模式为了兼容未知工具保持开启，需点回小窗或再次点击该菜单退出。第三方截图工具捕获顺序各异，不能保证自动快捷键适配所有版本。
- 全局键盘钩子仅识别上述截图组合键，不存储、上传按键，也不读取剪贴板。截图期间的后台采样结果会作废，恢复后重新采样；桌面图像不写入磁盘。

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
- 小窗齿轮编辑窗口大小、玻璃不透明度与玻璃模糊度，保存到项目目录的 `ui-settings.json`；不透明度向左更通透、向右更沉稳，模糊度为 0 时不加磨砂，文字对比色层始终保留。数据路径是只读展示，附带已发现 / 不存在 / 已禁用状态。

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
├─ deploy.bat               一键初始化、启用登录自启、确认托盘就绪
├─ tray.ps1                 Windows 托盘 / WebView2 原生外壳
├─ panel.html               唯一小窗界面
├─ server.mjs               六类数据扫描、聚合、本地 API
├─ config.mjs               配置读取与路径解析
├─ config.example.json      可复制的配置模板
├─ model_prices.json        离线价格快照
├─ server.test.mjs          统计 / 去重 / 日期 / 价格测试
├─ config.test.mjs          路径迁移与配置测试
├─ panel-motion.test.mjs    对象保留、新增/移除、排序与快速切换测试
├─ scripts/
│  ├─ setup.ps1             SDK 初始化、登录自启开关
│  ├─ start.ps1             依赖检查、错误提示、启动托盘
│  ├─ startup.ps1           自启命令构造、路径与长度校验
│  ├─ test-startup.ps1      自启命令与 PowerShell 语法测试
│  ├─ test-screenshot.ps1   截图快捷键、窗口捕获状态与恢复测试
│  ├─ build-icon.ps1        重建多分辨率 ICO
│  ├─ test-glass.ps1        合成图像模糊与动画曲线测试
│  ├─ verify.py             旧 TokenBar 独立参考，不是当前 Windows 全量验收
│  └─ devin_compare.py      Devin 去重证据检查，可用 --db 指定数据库
├─ assets/                  ICO / PNG / SVG 图标
├─ native/
│  ├─ GlassEffects.cs        本机背景磨砂算法、窗口动效曲线
│  └─ ScreenshotGuard.cs     截图模式与本机快捷键监听
├─ ui-settings.mjs           界面偏好校验、兼容与存储
├─ ui-settings.test.mjs      模糊度、零值保存与旧偏好兼容测试
├─ licenses/                第三方授权说明
├─ video/                   60 秒宣传片源码、原创配乐与发布文案（独立依赖）
└─ lib/webview2/pkg/         本机安装的 SDK（Git 忽略）
```

本机配置、界面偏好、日志、诊断输出、依赖和截图不入版本控制。旧 `backdrop.png` 已移除；背景采样只在本机内存中直接传给小窗，不再保存为仓库文件。

宣传片工程、渲染要求及人工示例数据边界见 [video/README.md](video/README.md)；[B 站](video/BILIBILI_RELEASE.md) / [小红书](video/XIAOHONGSHU_RELEASE.md) 发布文案随源码提供。成片和渲染浏览器不进 Git，视频依赖不会被 `deploy.bat` 安装，也不影响日常托盘运行。

## 开发与验证

```powershell
node --check server.mjs
node --test server.test.mjs config.test.mjs ui-settings.test.mjs panel-motion.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-glass.ps1
powershell -NoProfile -STA -ExecutionPolicy Bypass -File .\scripts\test-screenshot.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-startup.ps1
node server.mjs --audit

# 前台启动检查（便于看错误）
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1 -Show
```

后端仅监听 `127.0.0.1`，默认端口 3080，不开放远程采集。`/panel` 是小窗内部页面；根路由 `/` 返回 410，独立网页版已删除。`/api?range=day|7d|30d|all` 返回统计，`/api/ui` 读写界面偏好并提供只读来源信息。

`tray.ps1` 保持 UTF-8 BOM，兼容 Windows PowerShell 5.1。不要把真实 Agent 日志、个人配置或桌面截图提交到仓库。旧 TokenBar 算法、价目快照与参考脚本的第三方 MIT 授权见 `licenses/TokenBar-LICENSE.txt`；参考脚本包含旧平台/旧日志假设，不作为当前 Codex Desktop 支持范围的证明。
