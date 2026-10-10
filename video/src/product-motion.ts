// Native GlassEffects.Ease + tray.ps1 Start-PanelMotion, sampled at 30 fps.
export const panelDurationMs = 240;
export const smoothstep = (p: number) => {
  const t = Math.max(0, Math.min(1, p));
  return t * t * (3 - 2 * t);
};
export const smoothRange = (frame: number, start: number, end: number) => smoothstep((frame-start)/(end-start));
export const panelMotion = (frame: number, start: number) => smoothstep((frame-start)/(panelDurationMs*30/1000));
