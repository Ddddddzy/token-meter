import React, {useLayoutEffect, useRef} from 'react';
import {continueRender, delayRender} from 'remotion';
import {ease, lerp} from '../motion';
import {demo, full, sum} from '../film-data';
import {panelCSS, panelHTML} from '../panel-reference';
import {desktop, panelBounds} from '../desktop-layout';
import {panelMotion} from '../product-motion';
import {backdropPresence, desktopBackdropURI} from '../desktop-backdrop';

const PANEL_W = 380, PANEL_H = 680, SCALE = 1.31;
export const PANEL_GEOMETRY = panelBounds(SCALE);
const names = ['Codex', 'Claude', 'opencode'];
const compact = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : full(n);
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]!));

// Actual product DOM/CSS is isolated from the film in a shadow root.
// No original scripts, APIs, private paths, clocks or browser animations run.
export const FilmWindow: React.FC<{frame: number}> = ({frame}) => {
  const host = useRef<HTMLDivElement>(null);
  const root = useRef<ShadowRoot | null>(null);
  const appear = panelMotion(frame,desktop.openStart), close = 1-panelMotion(frame,desktop.closeStart);
  const visible = appear*close;
  const focus = ease(frame, 948, 986) * (1 - ease(frame, 1168, 1210));
  const settings = ease(frame, 1216, 1260);
  const scale = SCALE + .13 * focus + .04 * settings;
  const {left,top} = panelBounds(scale);

  useLayoutEffect(() => {
    if (!host.current || visible===0) return;
    const paintHandle = delayRender(`Paint actual panel frame ${frame}`);
    if (!root.current) {
      root.current = host.current.attachShadow({mode: 'open'});
      root.current.innerHTML = `<style>${panelCSS}
        :host{display:block;position:relative;width:380px;height:680px;line-height:1.5;color-scheme:light;--fg:#20232d;--sec:#666c7c;--line:rgba(95,110,140,.15);--track:rgba(95,110,140,.1);--hover:rgba(100,130,200,.08);--pill:rgba(255,255,255,.88);font:12px/1.5 "Film Times","Film Song","Times New Roman","SimSun",serif}
        *,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
        .glass{position:absolute;border-radius:28px;background:#e5e7ea}
        .glass-image{inset:auto;background-size:100% 100%;z-index:1;filter:blur(var(--glass-blur)) saturate(.72)}
        #glassNext{display:none}.glass-wash{background:rgba(248,249,251,.52)}.glass-tint{background:var(--surface)}
        .panel{color:var(--fg);--frame-outline:rgba(76,84,100,.38);--rim-top:rgba(255,255,255,.8);--rim-side:rgba(255,255,255,.35);--rim-low:rgba(255,255,255,.1);--rim-corner:rgba(255,255,255,.45)}
        .panel::before{box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}
        .footer{background:rgba(255,255,255,.16)}
        .big{font-size:29.26px}.money{font-size:22.8px}
        .content{scrollbar-gutter:stable;scrollbar-width:thin;overflow-y:hidden;overflow-anchor:none}
        .details{display:block;opacity:1}.details-inner{overflow:hidden}
        .row[aria-expanded=true]{background:var(--hover)}
        .row{padding-top:7px;padding-bottom:7px}
        .indicator{z-index:0}.pill button{position:relative;z-index:1}
        input[type=range]{appearance:none;height:4px;border-radius:8px;background:linear-gradient(to right,var(--accent) var(--fill),var(--track) var(--fill));padding:0}
        input[type=range]::-webkit-slider-thumb{appearance:none;width:12px;height:12px;border-radius:50%;background:#fff;border:1px solid var(--accent);box-shadow:0 1px 3px #0002}
      </style>${panelHTML}`;
      const content = root.current.getElementById('scroll')!;
      const wrapper = document.createElement('div');
      wrapper.id = 'filmScrollContent'; wrapper.style.position = 'relative'; wrapper.style.paddingBottom = '110px';
      while(content.firstChild) wrapper.appendChild(content.firstChild);
      content.appendChild(wrapper);
      const thumb = document.createElement('i'); thumb.id = 'filmScrollThumb';
      thumb.style.cssText = 'position:absolute;right:4px;width:3px;border-radius:8px;background:rgba(125,140,168,.48);pointer-events:none';
      root.current.getElementById('panel')!.appendChild(thumb);
    }
    const shadow = root.current;
    const $ = (id: string) => shadow.getElementById(id)!;
    const weekly = ease(frame, 730, 766) * (1 - ease(frame, 911, 941)), models = ease(frame, 843, 878) * (1 - ease(frame, 911, 941));
    const expanded = ease(frame, 921, 968) * (1 - ease(frame, 1178, 1214));
    const values = demo.daily.map((v, i) => lerp(v, demo.weekly[i], weekly));
    const total = sum(values), money = lerp(1.42, 6.83, weekly);
    const glass = lerp(80, 35, ease(frame, 1270, 1312));
    const blur = lerp(0, 75, ease(frame, 1360, 1404));
    host.current.style.setProperty('--surface', `rgba(248,249,251,${glass / 100})`);
    // Gaussian presentation approximates the native three-pass box blur.
    // It is applied to the backdrop only, never foreground text or controls.
    host.current.style.setProperty('--glass-blur', `${blur * .4}px`);
    const backdrop = $('glassImage');
    backdrop.style.backgroundImage = `url("${desktopBackdropURI}")`;
    backdrop.style.left = `${-left/scale}px`; backdrop.style.top = `${-top/scale}px`;
    backdrop.style.width = `${1920/scale}px`; backdrop.style.height = `${1004/scale}px`;
    backdrop.style.opacity = String(backdropPresence(frame));
    $('sumLabel').textContent = weekly > .5 ? '7 天用量' : '今日用量';
    $('total').textContent = compact(total); $('exact').textContent = full(total);
    $('cost').textContent = '$' + money.toFixed(2); $('coverage').textContent = '全部已计价';
    $('moneyNote').textContent = '用量估价，不代表订阅实际扣款。';
    $('chartTitle').textContent = weekly > .5 ? '7 天 · 按日期' : '今日 · 按小时';
    $('chartValue').textContent = '合计 ' + compact(total);
    $('axis').innerHTML = weekly > .5 ? '<span>10/03</span><span>10/06</span><span>10/09</span>' : '<span>00:00</span><span>12:00</span><span>23:00</span>';
    $('legend').innerHTML = names.map((n, i) => `<span><i style="background:${demo.colors[i]}"></i>${n}</span>`).join('');
    const select = (id: string, index: number) => {
      const group = $(id), buttons = Array.from(group.querySelectorAll('button'));
      buttons.forEach((b, i) => b.setAttribute('aria-selected', String(i === Math.round(index))));
      const indicator = group.querySelector<HTMLElement>('.indicator')!;
      indicator.style.width = buttons[0].offsetWidth + 'px';
      indicator.style.transform = `translateX(${buttons[0].offsetLeft - 3 + index * (buttons[1].offsetLeft - buttons[0].offsetLeft)}px)`;
    };
    select('rangeTabs', weekly); select('dimensionTabs', models);
    const row = (i: number, model = false, child = false) => {
      const value = values[i], pct = Math.round(value / total * 100);
      return `<div class="row" ${!model && !child ? `role="button" aria-expanded="${i === 0 && expanded > .5}"` : ''}>
        <div class="rowhead"><i class="dot" style="background:${demo.colors[i]}"></i><span class="name">${escape(model || child ? demo.models[i] : names[i])}</span><span class="chevron">${model || child ? '' : '›'}</span></div>
        ${model ? `<div class="sub">${names[i]}</div>` : ''}
        <div class="metrics"><span class="tokens">${compact(value)}</span><span class="share">${pct}%</span><span class="cost">$${(money * value / total).toFixed(2)}</span></div>
        <div class="bar"><i style="--width:${pct}%;--color:${demo.colors[i]}"></i></div></div>`;
    };
    const stats = [['输入（含缓存）', demo.codex.input], ['缓存命中', demo.codex.cached], ['输出（含推理）', demo.codex.output], ['其中推理', demo.codex.reasoning]] as const;
    $('list').innerHTML = values.map((_, i) => row(i, models > .5) + (i === 0 && models <= .5 ? `<div class="details"><div class="details-inner" style="height:${expanded * 164}px;opacity:${expanded}"><div class="detailpad"><div class="codexstats">${stats.map(([n, v]) => `<div>${n}<strong>${full(v)}</strong></div>`).join('')}</div>${row(i, false, true)}</div></div></div>` : '')).join('');
    $('notes').textContent = '';
    $('settings').hidden = settings === 0; $('settings').style.opacity = String(settings);
    const setSlider = (id: string, value: number, min: number, max: number) => {
      const slider = $(id) as HTMLInputElement; slider.value = String(value);
      slider.style.setProperty('--fill', `${(value - min) / (max - min) * 100}%`);
      $(id + 'Value').textContent = Math.round(id === 'blur' ? value : value * 100) + '%';
    };
    setSlider('scale', 1, .8, 1.4); setSlider('glass', glass / 100, .15, .9); setSlider('blur', blur, 0, 100);
    $('sources').innerHTML = '<div>数据来源（只读；修改配置后重启）</div>' + [['Codex', '~/.codex'], ['Claude Code', '~/.claude/projects'], ['Command Code', '~/.commandcode/projects'], ['opencode', '~/.local/share/opencode/opencode.db'], ['Devin CLI', '%APPDATA%/devin/cli/sessions.db'], ['Cursor（估算）', '%APPDATA%/Cursor/User/globalStorage/state.vscdb'], ['Cursor tracking', '~/.cursor/ai-tracking/ai-code-tracking.db']].map(([n,p]) => `<div class="source"><b>${n} · 演示目录</b><div>${p}</div></div>`).join('');
    $('status').textContent = '更新于 12:00:00 · 本机 · 演示数据';
    $('config').setAttribute('aria-pressed', String(settings > .5));
    const scroll = $('scroll');
    const content = $('filmScrollContent');
    // Drive the product's scrolling view by a frame-based transform, not native
    // asynchronous scrolling, which the capture browser may reset during export.
    const maxScroll = Math.max(0, content.offsetHeight - scroll.clientHeight + 16);
    const target = Math.min(maxScroll, $('settings').offsetTop);
    const scrollOffset = lerp(Math.min(maxScroll, 170 * focus), target, settings);
    scroll.scrollTop = 0; content.style.transform = `translateY(${-scrollOffset}px)`;
    const thumb = $('filmScrollThumb'), trackH = scroll.clientHeight - 10;
    const thumbH = trackH * scroll.clientHeight / Math.max(scroll.clientHeight, content.offsetHeight);
    thumb.style.height = thumbH + 'px';
    thumb.style.top = (scroll.offsetTop + 5 + (maxScroll ? scrollOffset / maxScroll * (trackH - thumbH) : 0)) + 'px';
    thumb.style.opacity = maxScroll > 0 ? '.8' : '0';
    const canvas = $('chart') as HTMLCanvasElement;
    const W = canvas.clientWidth, H = 72, dpr = 4;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const chartIn = ease(frame, 474, 536), n = 24, slot = W / n;
    const bins = Array.from({length: n}, (_, i) => lerp(demo.hourlyWeights[i] / Math.max(...demo.hourlyWeights), i < 7 ? demo.weekBins[i] / Math.max(...demo.weekBins) : 0, weekly));
    bins.forEach((v, i) => {
      const x = lerp(i * slot + 2, i < 7 ? i * W / 7 + 3 : i * slot + 2, weekly);
      const w = lerp(slot - 4, i < 7 ? W / 7 - 6 : 0, weekly);
      if (w <= 0) return;
      let bottom = H;
      values.forEach((value, j) => {
        const h = Math.max(0, v * 68 * value / total * chartIn);
        ctx.fillStyle = demo.colors[j]; ctx.globalAlpha = i < 7 ? 1 : 1 - weekly;
        if (h > 0) ctx.fillRect(x, bottom - h, w, h);
        bottom -= h;
      });
      if (v === 0) {ctx.fillStyle = 'rgba(95,110,140,.1)';ctx.fillRect(x, H - 3, w, 3);}
    });
    ctx.globalAlpha = 1;
    // Scroll/canvas compositor updates must settle before Remotion captures a frame.
    // These rAFs synchronize painting only; frame values drive all motion.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      continueRender(paintHandle);
    }));
  }, [frame, settings]);

  return <div data-video-safe="actual-panel" style={{position: 'absolute', left, top, width: PANEL_W * scale, height: PANEL_H * scale, clipPath: `inset(${(1-visible)*100}% 0 0 0 round ${Math.min(28*scale,PANEL_H*scale*visible/2)}px)`}}>
    <div ref={host} style={{width: PANEL_W, height: PANEL_H, transform: `scale(${scale})`, transformOrigin: 'top left', borderRadius: 28, overflow: 'hidden'}}/>
  </div>;
};
