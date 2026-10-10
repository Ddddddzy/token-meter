import {smoothRange} from './product-motion.ts';

// One synthetic desktop fixture is used both on stage and behind the glass.
// No desktop capture, external image, account data or animation timer.
export const backdropPresence = (frame: number) => smoothRange(frame,1155,1200)*(1-smoothRange(frame,1494,1542));
export const desktopBackdropSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1004" viewBox="0 0 1920 1004">
<defs>
 <linearGradient id="wall" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#284359"/><stop offset=".5" stop-color="#8aa49b"/><stop offset="1" stop-color="#be9976"/></linearGradient>
 <linearGradient id="fold" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#39546d"/><stop offset="1" stop-color="#9fb7b1"/></linearGradient>
 <linearGradient id="mask"><stop offset=".51" stop-color="black"/><stop offset=".64" stop-color="white"/></linearGradient>
 <mask id="right"><rect width="1920" height="1004" fill="url(#mask)"/></mask>
 <pattern id="grid" width="72" height="72" patternUnits="userSpaceOnUse"><path d="M72 0H0V72" fill="none" stroke="#70859a" stroke-width="2" opacity=".25"/></pattern>
</defs>
<g mask="url(#right)">
 <rect width="1920" height="1004" fill="url(#wall)"/>
 <path d="M1080 1004Q1710 360 1510 0H1920V1004Z" fill="url(#fold)"/>
 <path d="M1230 1004Q1850 540 1740 0" stroke="#c7d4ca" stroke-width="110" fill="none" opacity=".5"/>
 <g transform="translate(1120 218)">
  <rect x="-6" y="5" width="850" height="670" rx="24" fill="#152434" opacity=".2"/>
  <rect width="838" height="650" rx="20" fill="#e4eaf0" stroke="#c5d1dc" stroke-width="2"/>
  <path d="M0 62H838" stroke="#bac8d5" stroke-width="2"/>
  <circle cx="26" cy="31" r="5" fill="#88a0b4"/><circle cx="46" cy="31" r="5" fill="#88a0b4"/><circle cx="66" cy="31" r="5" fill="#88a0b4"/>
  <rect x="104" y="23" width="180" height="15" rx="7" fill="#a7b9c8"/>
  <path d="M174 62V650" stroke="#c0cdd9" stroke-width="2"/>
  <g fill="#a3b5c5"><rect x="24" y="95" width="118" height="12" rx="6"/><rect x="24" y="133" width="92" height="12" rx="6"/><rect x="24" y="171" width="108" height="12" rx="6"/><rect x="24" y="209" width="75" height="12" rx="6"/></g>
  <rect x="209" y="91" width="520" height="310" rx="12" fill="#d3dfe8"/>
  <rect x="209" y="91" width="520" height="310" rx="12" fill="url(#grid)"/>
  <path d="M233 354L302 299L367 329L435 235L504 262L569 175L643 213L710 129" stroke="#698db0" stroke-width="12" fill="none" stroke-linejoin="round"/>
  <g fill="#789f94"><rect x="225" y="461" width="128" height="112" rx="14"/><rect x="374" y="461" width="128" height="112" rx="14"/></g>
  <rect x="523" y="461" width="188" height="112" rx="14" fill="#b89571"/>
  <g fill="#f2f5f5"><rect x="244" y="482" width="84" height="12" rx="6"/><rect x="393" y="482" width="84" height="12" rx="6"/><rect x="542" y="482" width="140" height="12" rx="6"/></g>
 </g>
</g></svg>`;
export const desktopBackdropURI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(desktopBackdropSVG)}`;
