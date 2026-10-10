import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Logo} from './components/Logo';
import {Reveal} from './components/Reveal';
import {UsageCard} from './components/UsageCard';
import {ease, lerp, progress, range, settle} from './motion';
import {records} from './data';
import {theme} from './theme';
import {smoothRange} from './product-motion';

export const Pilot: React.FC<{handoff?: boolean}> = ({handoff = false}) => {
  const frame = useCurrentFrame();
  const sceneExit = handoff ? smoothRange(frame,342,366) : 0;
  const reflow = ease(frame, 138, 184);
  const badgeSize = lerp(240, 68, reflow);
  const badgeX = lerp(960, 147, reflow), badgeY = lerp(314, 103, reflow);
  const brandSize = lerp(142, 34, reflow);
  const brandX = lerp(960, 313, reflow), brandY = lerp(553, 103, reflow);
  const introExit = 1 - progress(frame, 132, 160);
  const chartLine = ease(frame, 210, 277);
  const camera = range(frame, [0, 110, 138, 184], [.985, 1, 1, 1]);
  const question = settle(frame, 172, 34);

  return <AbsoluteFill style={{background: handoff ? 'transparent' : theme.background, color: theme.ink,
    fontFamily: theme.chinese, overflow: 'hidden', WebkitFontSmoothing: 'antialiased'}}>
    {!handoff && <AbsoluteFill style={{background: 'radial-gradient(ellipse at 76% 52%,rgba(47,79,126,.13),transparent 57%),linear-gradient(125deg,rgba(255,255,255,.018),transparent 55%)'}}/>}
    <div style={{position: 'absolute', left: 112, top: 88, fontFamily: theme.english,
      fontSize: 22, letterSpacing: '2px', color: '#7b8799', opacity: 1 - reflow}}>A QUIET VIEW OF YOUR AI USAGE</div>
    <div style={{position: 'absolute', right: 112, top: 88, fontFamily: theme.english,
      fontSize: 22, letterSpacing: '2px', color: '#7b8799', opacity: 1 - reflow}}>TOKEN METER / WINDOWS</div>

    <AbsoluteFill style={{transform: `scale(${camera})`}}>
      <div style={{position: 'absolute', left: badgeX, top: badgeY,
        width: badgeSize, height: badgeSize, transform: 'translate(-50%,-50%)'}}>
        <Logo frame={frame} size={badgeSize}/>
      </div>
      <div data-video-safe="brand" style={{position: 'absolute', left: brandX, top: brandY,
        transform: 'translate(-50%,-50%)', fontFamily: theme.english,
        fontSize: brandSize, fontWeight: 400, letterSpacing: `${lerp(-1, 0, reflow)}px`,
        whiteSpace: 'nowrap', lineHeight: 1.15}}>
        <Reveal frame={frame} start={48} height={175}>Token Meter</Reveal>
      </div>
      <div style={{position: 'absolute', left: 0, top: 681, width: '100%', textAlign: 'center',
        fontSize: 54, fontWeight: 400, letterSpacing: '1.5px', opacity: introExit,
        transform: `translateY(${-32 * reflow}px)`}}>
        <Reveal frame={frame} start={70} height={100}>让每一次调用，<span style={{color: '#81b1fa'}}>看得见。</span></Reveal>
      </div>
      <div style={{position: 'absolute', left: 0, top: 806, width: '100%', textAlign: 'center',
        fontFamily: theme.english, fontSize: 23, letterSpacing: '2px', color: '#667488',
        opacity: ease(frame, 94, 116) * introExit}}>LOCAL LOGS. ONE LITTLE WINDOW.</div>
    </AbsoluteFill>

    <div style={{position: 'absolute', left: 122, top: 260, opacity: question * (1 - sceneExit)}}>
      <div style={{fontSize: 28, color: theme.secondary, letterSpacing: '3px', marginBottom: 34}}>一个简单的问题</div>
      <div data-video-safe="question" style={{fontSize: 92, fontWeight: 400, lineHeight: 1.3, letterSpacing: '0px', whiteSpace: 'nowrap'}}>
        <Reveal frame={frame} start={172} height={150}>每一次调用，</Reveal>
        <Reveal frame={frame} start={182} height={150}>到底用了<span style={{color: '#81b1fa'}}>多少？</span></Reveal>
      </div>
      <div data-video-safe="support" style={{marginTop: 63, fontSize: 32, lineHeight: 1.8,
        color: theme.secondary, opacity: ease(frame, 211, 237),
        transform: `translateY(${24 * (1 - ease(frame, 211, 237))}px)`}}>记录分散在不同工具里。<br/><span style={{color: '#e5e9ef'}}>用量，不该靠猜。</span></div>
    </div>

    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{position: 'absolute', inset: 0, opacity: ease(frame, 209, 230) * (1 - sceneExit)}}>
      <path d="M989 256V764 M989 324H1110 M989 544H1172 M989 764H1050" fill="none" stroke="#263348" strokeWidth="1.5"/>
      <path d="M989 256V764 M989 324H1110 M989 544H1172 M989 764H1050" fill="none" stroke={theme.accent} strokeWidth="2.5" pathLength="1"
        strokeDasharray="1" strokeDashoffset={1 - chartLine}/>
    </svg>
    <div style={{opacity:1-sceneExit}}>{records.map(record => <UsageCard key={record.agent} frame={frame} record={record}/>)}</div>

    <div style={{position: 'absolute', left: 122, bottom: handoff ? 110 : 75,
      fontSize: 22, color: '#727e8f', letterSpacing: '2px', fontFamily: theme.english, opacity: reflow * (1 - sceneExit)}}>WINDOWS · LOCAL AGENT USAGE</div>
    <div data-video-safe="demo-label" style={{position: 'absolute', right: 126, bottom: handoff ? 110 : 72,
      fontSize: 26, color: '#8994a5', opacity: ease(frame, 195, 218) * (1 - sceneExit)}}>演示数据 · 本地 usage 记录示意</div>
  </AbsoluteFill>;
};
