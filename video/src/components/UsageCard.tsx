import React from 'react';
import {records} from '../data';
import {lerp, settle} from '../motion';
import {theme} from '../theme';
import {interpolateColors} from 'remotion';

export const UsageCard: React.FC<{frame: number; record: typeof records[number]; merge?: number; target?: {x: number; y: number; width: number; height: number}}> = ({frame, record, merge = 0, target}) => {
  const p = settle(frame, record.delay, 38);
  const total = record.input + record.output;
  return <div data-video-safe="card" style={{position: 'absolute', left: lerp(record.x, target?.x ?? record.x, merge), top: lerp(record.y, target?.y ?? record.y, merge),
    width: lerp(586, target?.width ?? 586, merge), height: lerp(176, target?.height ?? 176, merge), padding: `${lerp(26, 8, merge)}px ${lerp(30, 16, merge)}px`, borderRadius: lerp(24, 12, merge), boxSizing: 'border-box', overflow: 'hidden',
    border: '1px solid rgba(236,244,255,.14)',
    background: interpolateColors(merge, [0, 1], ['#202733', '#e9eef6']),
    boxShadow: `0 ${24 * (1 - merge)}px ${64 * (1 - merge)}px rgba(0,0,0,${.2 * (1 - merge)})`,
    transform: `translate(${lerp(150, 0, p)}px,${lerp(58, 0, p)}px) scale(${lerp(.92, 1, p)})`,
    opacity: p, color: interpolateColors(merge, [0, 1], [theme.ink, '#20232d']), fontFamily: theme.english}}>
    <div style={{display: 'flex', alignItems: 'center', gap: 13}}>
      <div style={{width: 9, height: 9, borderRadius: 9, background: record.color}}/>
      <div style={{fontSize: lerp(30, 26, merge), fontWeight: 700, letterSpacing: '0px'}}>{record.agent}</div>
      <div style={{marginLeft: 'auto', fontSize: 22, color: theme.secondary, letterSpacing: '.4px', opacity: 1 - merge}}>{record.source}</div>
    </div>
    <div style={{display: 'flex', alignItems: 'baseline', gap: 10, marginTop: lerp(18, 1, merge)}}>
      <span style={{fontSize: lerp(52, 25, merge), lineHeight: 1, fontWeight: 400, letterSpacing: '0px', fontVariantNumeric: 'tabular-nums'}}>{total.toLocaleString('en-US')}</span>
      <span style={{fontSize: lerp(24, 21, merge), color: theme.secondary}}>tokens</span>
      <div style={{marginLeft: 'auto', textAlign: 'right', fontSize: 22, lineHeight: 1.4, color: '#8b98ab', opacity: 1 - merge}}>
        <div>IN {record.input.toLocaleString('en-US')}</div><div>OUT {record.output.toLocaleString('en-US')}</div>
      </div>
    </div>
  </div>;
};
