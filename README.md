# Token Meter

<img src="assets/token-meter.png" width="96" height="96" alt="Token Meter icon">

在 Windows 托盘里，随时查看你的 AI 编程用量。

Token Meter 将多个 Agent 的本地用量记录汇总到一个小窗，帮助你了解用了多少 token、主要使用哪些模型，以及用量随时间的变化。不需要 API Key，也不需要逐个翻找日志。

## 主要功能

- **多 Agent 汇总**：在同一个界面查看不同工具的用量。
- **时间范围切换**：支持今日、最近 7 天、最近 30 天和全部记录。
- **按 Agent / 模型查看**：展示用量、占比和费用估价，展开 Agent 可查看模型明细。
- **趋势图与自动刷新**：查看用量变化，生成新的本地记录后自动更新。
- **轻量托盘小窗**：点击托盘图标即可展开或收起，支持登录自启。
- **可调整的玻璃界面**：支持浅色 / 深色外观、窗口缩放，以及独立的透明度和模糊度设置。

## 支持的 Agent

| Agent | 支持情况 |
| --- | --- |
| Codex CLI / Desktop | 基于本地 usage 统计，提供输入、缓存、输出和推理明细。 |
| Claude Code | 读取本地会话中的 usage 记录。 |
| Command Code / cmdc | 读取本地会话记录，按该工具的用量口径统计。 |
| opencode | 读取本地用量记录。 |
| Devin CLI | 读取本地用量指标；部分记录可能只有输出计数。 |
| Cursor | 根据本地内容估算 token，**不是官方精确用量**。 |

只需安装你实际使用的 Agent；不存在的数据源会跳过。模型名称来自本地记录，支持某个 Agent 不代表其所有版本和模型都已验证，也不代表每个模型都有可用价格。

目前只统计本机可读取的记录，**不统计 ChatGPT 网页、手机端或其他设备的用量**。

## 快速开始

### 环境要求

- Windows x64。
- [Node.js](https://nodejs.org/) 22.13 或更高版本，且支持 `node:sqlite`。
- Windows PowerShell 5.1、.NET Framework 4.6.2 或更高版本。
- [Microsoft WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。

### 安装

```powershell
git clone https://github.com/Disc13/token-meter.git
cd token-meter
.\deploy.bat
```

也可以下载并解压仓库后，双击 **`deploy.bat`**。

部署脚本会检查依赖、下载所需的 WebView2 SDK、启用当前用户登录自启，并启动托盘。首次部署需要联网；缺少 Node.js 或 WebView2 Runtime 时，请按提示安装后重试。后端不需要运行 `npm install`。

### 日常使用

1. 点击任务栏中的 Token Meter 图标打开小窗；图标也可能位于隐藏图标区域。
2. 选择时间范围，切换“按 Agent”或“按模型”查看用量。
3. 点击 Agent 展开明细，点击齿轮调整小窗外观，点击刷新重新扫描记录。
4. 点击窗外、按 `Esc` 或点击收起按钮关闭小窗；右键托盘图标可退出程序。

手动启动时，双击 **`token-meter.vbs`**。重复启动不会创建多个托盘实例。

`deploy.bat` 默认启用登录自启。若不需要，可运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup.ps1 -RemoveAutoStart
```

移动项目目录或换设备后，重新运行 `deploy.bat`。启动失败时，可查看 `%LOCALAPPDATA%\token-meter\startup.log`。

## 数据来源与配置

默认会自动查找当前用户的 Agent 数据目录，通常无需配置。小窗设置中可以查看各数据源的路径和发现状态。

如需指定其他位置，将 [config.example.json](config.example.json) 复制为 `config.json`，仅修改需要覆盖的项目。例如：

```json
{
  "port": 3080,
  "sources": {
    "codex": "~/.codex",
    "claude": "%USERPROFILE%/.claude/projects",
    "cursor": false
  }
}
```

- 未填写或设为 `null`：使用默认路径；设为 `false`：禁用该数据源。
- Codex 填 `.codex` 根目录，Claude / cmdc 填 `projects` 目录；数据库来源填完整数据库文件路径。
- 支持相对路径、`~/` 和 `%环境变量%`。相对路径以配置文件所在目录为基准；Windows 路径建议使用 `/`，或将反斜杠写为 `\\`。
- 可用 `TOKEN_METER_CONFIG` 指定外部配置文件，或用 `TOKEN_METER_PORT` 覆盖端口。
- 修改数据来源或端口后，需要退出并重新启动。

换设备时，默认路径会随当前用户变化。个人配置 `config.json` 和界面偏好 `ui-settings.json` 不随 Git 同步；如需保留，可自行迁移并检查路径。本地 Agent 历史不会随项目一起迁移。

## 如何理解统计结果

**Token 用量**来自 Agent 写入的本地记录；缺失或尚未写入的 usage 无法统计。Codex 请求完成并记录 usage 后才会显示，不表示账户剩余额度。Codex 的缓存属于输入、推理属于输出，总量不会重复加上这两部分。

**费用为参考估价**：优先使用记录提供的费用，否则按内置价格快照折算。估算项目以 `≈` 标记；未收录价格的模型仍统计 token，但不计入已知费用。价格快照不会自动联网更新，估价不等于订阅扣款或平台正式账单。

Cursor 当前采用估算方式，不适合用作精确对账依据。不同 Agent 的记录格式与用量定义也可能存在差异。

## 本地与隐私

用量数据在本机读取和处理，不需要提供 API Key，也不会将 Agent 历史上传到远程服务。本地服务只监听 `127.0.0.1`。个人配置、界面偏好和本地日志不纳入版本控制。

## 后续计划

- **按设备分类（待开发）**：当前仅支持本机，尚未实现多设备采集、同步与合并统计。
- Cursor 精确用量接入。
- 在界面中编辑数据源路径。
- 打包安装器与更多 Agent 日志版本的兼容验证。

## 开发与相关资料

后端使用 Node.js 内置模块，托盘界面由 PowerShell 与 WebView2 承载。运行核心测试：

```powershell
node --test server.test.mjs config.test.mjs ui-settings.test.mjs panel-motion.test.mjs
```

宣传片源码与说明见 [video/README.md](video/README.md)。第三方 TokenBar 参考代码的授权见 [licenses/TokenBar-LICENSE.txt](licenses/TokenBar-LICENSE.txt)。
