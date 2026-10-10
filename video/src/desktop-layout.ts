// 1920x1080 stage. The native product anchors 12px above the work area
// and 12px from its right edge; no translation is used for window visibility.
export const desktop = {
  width: 1920, height: 1080, taskbarHeight: 76, taskbarTop: 1004,
  panelRight: 1908, panelBottom: 992, trayX: 1760, trayY: 1042,
  openClick: 400, openStart: 402, openEnd: 409.2,
  closeClick: 1456, closeStart: 1458, closeEnd: 1465.2,
};
export const panelBounds = (scale: number) => ({
  left: desktop.panelRight - 380 * scale,
  top: desktop.panelBottom - 680 * scale,
  width: 380 * scale, height: 680 * scale,
  right: desktop.panelRight, bottom: desktop.panelBottom,
});
