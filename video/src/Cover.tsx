import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Logo} from './components/Logo';
import {FilmWindow} from './components/FilmWindow';
import {theme} from './theme';
import {WindowsTaskbar} from './components/WindowsTaskbar';
export const Cover: React.FC = () => <AbsoluteFill style={{background: theme.background, color: theme.ink, fontFamily: theme.chinese}}>
  <AbsoluteFill style={{background: 'radial-gradient(ellipse at 75% 54%,rgba(47,79,126,.16),transparent 57%)'}}/>
  <div style={{position: 'absolute', left: 114, top: 75, display: 'flex', alignItems: 'center', gap: 30}}><Logo frame={200} size={88}/><span style={{fontFamily: theme.english, fontSize: 60}}>Token Meter</span></div>
  <div style={{position: 'absolute', left: 122, top: 337, fontSize: 104, lineHeight: 1.42}}>多个 Agent，<br/><span style={{color: '#81b1fa'}}>一个用量小窗。</span></div>
  <div style={{position: 'absolute', left: 122, top: 741, fontSize: 34, lineHeight: 1.8, color: theme.secondary}}>本机日志汇总 · 无需 API Key<br/>Windows x64</div>
  <FilmWindow frame={600}/>
  <div style={{position: 'absolute', left: 122, bottom: 110, fontSize: 26, color: '#8994a5'}}>界面演示 · 示例数据</div>
  <WindowsTaskbar frame={600}/>
</AbsoluteFill>;
