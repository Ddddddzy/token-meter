import {cancelRender, continueRender, delayRender} from 'remotion';

if (typeof document !== 'undefined') {
  const handle = delayRender('Load installed SimSun and Times New Roman');
  const fonts = [
    // Use installed fonts; do not copy proprietary system font binaries.
    new FontFace('Film Song', 'local("SimSun")', {weight: '400'}),
    new FontFace('Film Times', 'local("Times New Roman")', {weight: '400'}),
    new FontFace('Film Times', 'local("Times New Roman Bold")', {weight: '700'}),
  ];
  Promise.all(fonts.map(font => font.load())).then(loaded => {
    loaded.forEach(font => document.fonts.add(font));
    continueRender(handle);
  }).catch(error => cancelRender(new Error(`请在渲染机器安装宋体 (SimSun) 和 Times New Roman。${error}`)));
}
