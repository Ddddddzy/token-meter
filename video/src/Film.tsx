import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {Pilot} from './Pilot';
import {FilmWindow} from './components/FilmWindow';
import {Logo} from './components/Logo';
import {Reveal} from './components/Reveal';
import {ease, lerp} from './motion';
import {theme} from './theme';
import {WindowsTaskbar, TrayInteraction} from './components/WindowsTaskbar';
import {DesktopBackdrop} from './components/DesktopBackdrop';

const Headline: React.FC<{frame: number; start: number; end: number; eyebrow: string; lines: string[]; note: React.ReactNode; size?: number}> = ({frame, start, end, eyebrow, lines, note, size = 87}) => {
  const enter = ease(frame, start, start + 32), exit = ease(frame, end - 27, end + 5);
  return <div style={{position: 'absolute', left: 122, top: 264, width: 850, opacity: enter * (1 - exit), transform: `translateY(${-28 * exit}px)`}}>
    <div style={{fontSize: 28, color: theme.secondary, letterSpacing: '2px', marginBottom: 34}}>{eyebrow}</div>
    <div data-video-safe="feature-headline" style={{fontSize: size, lineHeight: 1.36}}>{lines.map((line, i) => <Reveal key={line} frame={frame} start={start + i * 9} height={135}><span style={{color: i === lines.length - 1 ? '#81b1fa' : theme.ink, whiteSpace: 'nowrap'}}>{line}</span></Reveal>)}</div>
    <div data-video-safe="feature-note" style={{fontSize: 32, lineHeight: 1.8, color: theme.secondary, marginTop: 58, opacity: ease(frame, start + 30, start + 61)}}>{note}</div>
  </div>;
};

export const Film: React.FC = () => {
  const frame = useCurrentFrame();
  const ending = ease(frame, 1650, 1716);
  const value = ease(frame, 1470, 1507) * (1 - ease(frame, 1636, 1671));
  return <AbsoluteFill style={{background: theme.background, color: theme.ink, fontFamily: theme.chinese, overflow: 'hidden', WebkitFontSmoothing: 'antialiased'}}>
    <AbsoluteFill style={{background: 'radial-gradient(ellipse at 76% 52%,rgba(47,79,126,.13),transparent 57%),linear-gradient(125deg,rgba(255,255,255,.018),transparent 55%)'}}/>
    <Audio src={staticFile('audio/token-meter-original.wav')} volume={.85}/>
    <DesktopBackdrop frame={frame}/><FilmWindow frame={frame}/>
    <Sequence from={0} durationInFrames={439}><Pilot handoff/></Sequence>
    {frame >= 439 && <>
      <div style={{position: 'absolute', left: lerp(147, 960, ending), top: lerp(103, 321, ending), transform: 'translate(-50%,-50%)'}}><Logo frame={200} size={lerp(68, 180, ending)}/></div>
      <div data-video-safe="brand" style={{position: 'absolute', left: lerp(313, 960, ending), top: lerp(103, 532, ending), transform: 'translate(-50%,-50%)', fontFamily: theme.english, fontSize: lerp(34, 112, ending), lineHeight: 1.1, whiteSpace: 'nowrap'}}>Token Meter</div>
    </>}
    <Headline frame={frame} start={432} end={658} eyebrow="本机用量，一处查看" lines={['分散的记录，', '一个小窗。']} note={<>支持来源的本地日志，集中查看。<br/>无需配置 API Key。</>}/>
    <Headline frame={frame} start={666} end={918} eyebrow="总览 → 范围 → 分布" lines={['从总量，', '到每个模型。']} note={<>今日、7 天、30 天、全部。<br/>模型名称来自日志。</>}/>
    <div style={{position: 'absolute', left: 122, top: 841, fontSize: 27, color: '#9ba4b2', opacity: ease(frame, 696, 721) * (1 - ease(frame, 902, 925))}}>用量估价，不是订阅账单。</div>
    <Headline frame={frame} start={930} end={1188} eyebrow="Codex 用量明细" lines={['输入、缓存、输出。', '清楚分开。']} size={76} note={<>缓存属于输入，推理属于输出。<br/>子集，不重复加总。</>}/>
    <Headline frame={frame} start={1208} end={1467} eyebrow="让小窗融入你的桌面" lines={['通透一点。', '柔和一点。']} note={<>不透明度与模糊度，独立调节。<br/>背景变化，文字保持清晰。</>}/>
    <div style={{position: 'absolute', left: 122, bottom: 110, fontSize: 26, color: '#8994a5', opacity: ease(frame, 439, 460) * (1 - ease(frame, 1460, 1475))}}>界面演示 · 示例数据 · Windows 本机</div>
    <div style={{position: 'absolute', top: 347, left: 0, right: 0, textAlign: 'center', opacity: value, transform: `translateY(${24 * (1 - ease(frame, 1470, 1507))}px)`}}>
      <div data-video-safe="value" style={{fontSize: 108, lineHeight: 1.42}}>看清用量，<br/><span style={{color: '#81b1fa'}}>专注创作。</span></div>
      <div style={{width: 330 * ease(frame, 1504, 1550), height: 3, margin: '28px auto 0', background: theme.accent}}/>
      <div style={{fontSize: 34, color: theme.secondary, marginTop: 34}}>Windows 本机 Agent 用量观察窗</div>
    </div>
    <div style={{position: 'absolute', top: 663, left: 0, right: 0, textAlign: 'center', opacity: ease(frame, 1682, 1725), transform: `translateY(${24 * (1 - ease(frame, 1682, 1725))}px)`}}>
      <div data-video-safe="cta" style={{fontSize: 46}}>获取源码 · 查看安装说明</div>
      <div style={{fontFamily: theme.english, fontSize: 44, marginTop: 36, color: '#81b1fa'}}>github.com/Disc13/token-meter</div>
      <div style={{fontSize: 29, color: theme.secondary, marginTop: 39}}>Windows x64 · 本机 Agent 用量统计</div>
    </div>
    <WindowsTaskbar frame={frame}/><TrayInteraction frame={frame}/>
  </AbsoluteFill>;
};
