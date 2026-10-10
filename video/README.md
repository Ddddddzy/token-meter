# Token Meter Motion Film

独立的 60 秒产品宣传片工程，不改变 Token Meter 的托盘、统计服务或依赖。完整脚本见 [VIDEO_PLAN.md](VIDEO_PLAN.md)，发布标题与简介见 [BILIBILI_RELEASE.md](BILIBILI_RELEASE.md)。旧的 10 秒无声样片保留作过程记录。

## 预览与渲染

需要 Node.js 22.18+（测试使用内置 TypeScript 擦除，本机实测 Node 24），已安装宋体 SimSun 与 Times New Roman（含 Bold）：

```powershell
npm ci
npm run music
npm run check
npm test
npm run film:stills
npm run film:4k
npm run postprocess
npm run validate
```

成片输出：`output/token-meter-film-60s-4k.mp4`，3840×2160 / 30fps / H.264 / yuv420p / BT.709 / CRF14，60 秒、1800 帧。包含原创轻电子 BGM 和柔和转场音效，双声道 48kHz AAC、目标码率 320kbps，无旁白。`postprocess` 从母版用 Lanczos 缩小生成 `output/token-meter-film-60s-1080p.mp4`（CRF16）；封面为 `output/token-meter-cover.png`。旧样片是 `output/token-meter-pilot-10s.mp4`。

帧获取优先使用原始共享内存，PNG 为无损回退，避免字体先经过 JPEG 压缩。4K 按两倍绘制分辨率渲染字体与矢量，不是放大已有 1080p 视频。`output/`、构建目录、浏览器和 `node_modules/` 不进 Git。

完成渲染后运行 `npm run preview`，浏览器访问 `http://127.0.0.1:4518`，点击播放可听到音乐。默认 1080p，可切换 4K、拖动和下载。服务只监听本机，按 Ctrl+C 停止；端口可用 `TOKEN_METER_VIDEO_PORT` 覆盖。重渲染后需刷新页面。

默认方式会下载 Remotion 管理的渲染浏览器。已有兼容浏览器可用环境变量 `TOKEN_METER_RENDER_BROWSER` 指定绝对路径。

这台 Windows 机器的 Edge 不兼容 Remotion 的默认启动参数，因此最终使用官方 Chrome Headless Shell，而不是接入日常浏览器。若自动下载受网络限制，可手动从 [Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/) 获取匹配的 Headless Shell 并解压，再设置：

```powershell
$env:TOKEN_METER_RENDER_BROWSER = '你的解压目录/chrome-headless-shell.exe'
npm run still
npm run film:4k
```

最终工程只使用 Remotion 公开 API，没有全局浏览器设置修改，也不需要把浏览器程序提交进仓库。单进程渲染避免同时打开多个浏览器造成内存压力。导出指定 BT.709 色彩空间，减小不同播放器显示偏差。

所有动画由帧编号驱动；没有浏览器计时动画或不固定随机数。`src/data.ts` 仅包含人工构造的示例 usage，不能替换为未脱敏的私人数据。字体先加载再允许渲染，帧可以乱序渲染。渲染机器需要安装宋体 (SimSun) 与 Times New Roman（含 Bold）；缺少字体会明确中止，不会悄悄换字体。

## 视觉与产品边界

白底黑色信号条 Logo 来自原产品；强调色沿用产品蓝。画面中的支持来源与文案取自 README 和源代码。未实现的多设备、ChatGPT 网页用量、剩余额度和订阅账单不纳入宣传。

工程包含品牌开场、日志概念卡片、小窗演示、今日 / 7 天切换、按模型分组、Codex 子集明细、玻璃设置、底边折叠和 GitHub 收尾。12 秒附近的概念卡片原地淡出，与后续真实小窗场景分开，不把 Agent 卡片变成产品窗口。界面直接复用产品 `panel.html` 的静态 DOM 和 CSS，保持 380×680 的窗口比例、列表内 Codex 展开和单滚动区设置；用 Shadow DOM 隔离，不运行产品原脚本或读取账户记录。字体按视频要求使用宋体 / Times New Roman；为混排留出空间，列表上下内边距各减少 2px，设置区域加入滚动留白。数字、费用和模型均为演示呈现，不是账户真实记录。

`src/panel-reference.ts` 是静态样式 / 结构快照，随工程迁移，无需原产品目录。产品界面变化后可运行 `node sync-panel-reference.mjs "产品目录/panel.html"` 重新提取；脚本同时保留来源文件 SHA256，不提取原脚本、日志或私人路径。滚动由帧数驱动的内容位移模拟，避免渲染浏览器重置原生滚动而输出错误画面。片尾地址为 `https://github.com/Disc13/token-meter`。

演示阶段加入代码绘制的 Windows 11 风格底部任务栏，不是实际桌面录屏。指针点击右侧 Token Meter 托盘图标，小窗沿底边向上展开；再次点击同一图标向下收起，任务栏和托盘图标继续保留。窗口始终距工作区底边、屏幕右边各 12px，放大时也保持锚点；开合按产品 tray.ps1 / GlassEffects.Ease 的 240ms、smoothstep 曲线和底边区域裁切实现，内容不随开合缩放。30fps 视频在离散帧上采样，不是逐像素复刻 WebView2 或 Windows 计时器。点击提示提前出现，点击后短暂保留再淡出，不叠加到下一段主标题。任务栏时钟固定为演示日期 2026/10/09 12:00，不读取系统桌面或通知。

玻璃阶段加入程序绘制的示意壁纸与工作区，窗外和玻璃内使用同一 SVG，按屏幕坐标取对应背景。保持产品的浅色 wash、可调 tint 与独立前景层；演示不透明度 80%→35%，模糊度 0%→75%。视频用 CSS 高斯模糊近似原生三次盒式预模糊，不宣称两种渲染器逐像素一致；不伪装成真实桌面录屏，也不对前景文字做模糊。

今日演示总量为 240,600，7 天 1,157,020；逐 Agent 与趋势总量一致，缓存 / 推理子集不重复加总。`npm test` 检查演示数据、原声格式与任务栏锚点；`npm run validate` 检查成片尺寸、帧率、帧数、音轨，并解码实际 AAC 音轨检查非静音且无削波，结果保存到 `output/validation.json`。未代发 B 站，也不自动推送 GitHub。

## 原创配乐

`music.mjs` 用固定种子合成 60 秒音乐与柔和 whoosh，输出 `public/audio/token-meter-original.wav`，没有第三方歌曲或采样。`npm run music` 可重建原声。配乐源码和输出可随工程迁移。`postprocess.mjs` 使用 Remotion 的 Windows FFmpeg，也可用 `TOKEN_METER_FFMPEG` 指定其他环境的工具。

## 字体与素材

- 当前中文使用宋体 (SimSun)，英文、数字和英文标点使用 Times New Roman；混排时按字形回退，不用宋体自带的拉丁字形。
- 这是按用户偏好采用的常见论文字体组合，不宣称所有论文的国标要求都相同。
- 从渲染机器的已安装字体加载，不复制或分发系统字体文件。换设备时需要自行合法安装相应字体；导出的 MP4 播放不需要安装字体。
- `public/fonts/` 的 Inter / Noto Sans SC 是初版遗留的开源素材，当前动画已不引用；原许可保存在 `licenses/`。
- Logo：`public/brand/token-meter.svg` 是原项目的向量素材；动画组件使用相同轮廓与三根信号条。
- 没有第三方音乐、商标截图、私人日志、桌面截图或真实费用；原创合成配乐是唯一音乐来源。

技术参考：[Remotion 渲染](https://www.remotion.dev/docs/render)、[spring](https://www.remotion.dev/docs/spring)、[本地字体](https://www.remotion.dev/docs/fonts)。Remotion 许可见 [官方许可](https://www.remotion.dev/license)；若未来改为企业视频服务，请重新核对许可适用条件。
