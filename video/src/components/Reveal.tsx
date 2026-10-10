import React from 'react';
import {settle} from '../motion';

export const Reveal: React.FC<{frame: number; start: number; children: React.ReactNode; height?: number}> = ({frame, start, children, height = 160}) => {
  const p = settle(frame, start, 32);
  return <div style={{overflow: 'hidden', paddingBottom: 8}}>
    <div style={{transform: `translateY(${height * (1 - p)}px)`}}>{children}</div>
  </div>;
};
