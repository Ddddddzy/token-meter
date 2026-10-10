import {Easing, interpolate, spring} from 'remotion';

export const clamp = (n: number) => Math.min(1, Math.max(0, n));
export const progress = (frame: number, start: number, end: number) => clamp((frame - start) / (end - start));
export const ease = (frame: number, start: number, end: number) => Easing.bezier(0.22, 1, 0.36, 1)(progress(frame, start, end));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export const settle = (frame: number, start: number, duration = 34) => clamp(spring({
  frame: frame - start, fps: 30, durationInFrames: duration,
  config: {damping: 25, stiffness: 130, mass: 0.9, overshootClamping: true},
}));
export const range = (frame: number, frames: number[], values: number[]) => interpolate(frame, frames, values, {
  extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.22, 1, 0.36, 1),
});
