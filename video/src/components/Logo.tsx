import React, {useId} from 'react';
import {ease, settle} from '../motion';

export const Logo: React.FC<{frame: number; size: number}> = ({frame, size}) => {
  const clipId = `logo-plate-${useId().replace(/:/g, '')}`;
  const plate = ease(frame, 27, 64);
  const bars = [
    {x: 14, y: 34, h: 16, start: 3},
    {x: 28, y: 25, h: 25, start: 10},
    {x: 42, y: 14, h: 36, start: 17},
  ];
  const renderBars = (fill: string) => bars.map((bar, index) => {
    const p = settle(frame, bar.start, 30);
    const h = Math.max(1.2, bar.h * p);
    return <rect key={index} x={bar.x} y={50 - h} width={8} height={h} rx={Math.min(4, h / 2)} fill={fill}/>;
  });
  return <svg width={size} height={size} viewBox="0 0 64 64" aria-label="Token Meter signal-bar logo">
    <defs><clipPath id={clipId}><rect x="0" y={64 * (1 - plate)} width="64" height={64 * plate}/></clipPath></defs>
    {renderBars('#f5f6f8')}
    <g clipPath={`url(#${clipId})`}>
      <rect x="2" y="2" width="60" height="60" rx="17" fill="#fff" stroke="#dedede" strokeWidth="1"/>
      {renderBars('#111')}
    </g>
  </svg>;
};
