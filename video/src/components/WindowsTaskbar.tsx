import React from 'react';
import {Logo} from './Logo';
import {ease, lerp, progress} from '../motion';
import {desktop} from '../desktop-layout';
import {theme} from '../theme';
import {smoothRange} from '../product-motion';

const SystemIcon: React.FC<{kind: 'up'|'wifi'|'volume'|'battery'; x:number}> = ({kind,x}) => <svg style={{position:'absolute',left:x-13,top:25}} width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#414954" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
  {kind==='up' ? <path d="m6 14 6-6 6 6"/> : kind==='wifi' ? <><path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="20" r=".8" fill="#414954" stroke="none"/></> : kind==='volume' ? <><path d="M3 9h4l5-4v14l-5-4H3zM16 8a7 7 0 0 1 0 8M18.5 5a11 11 0 0 1 0 14"/></> : <><rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 10v4"/><rect x="5" y="10" width="11" height="4" rx="1" fill="#414954" stroke="none"/></>}
</svg>;

export const WindowsTaskbar: React.FC<{frame:number}> = ({frame}) => {
  const presence = smoothRange(frame,366,382) * (1 - smoothRange(frame,1512,1542));
  const hover = ease(frame,392,399) * (1-ease(frame,422,435)) + ease(frame,1438,1452) * (1-ease(frame,1480,1493));
  const press = ease(frame,400,401)*(1-ease(frame,402,405)) + ease(frame,1456,1457)*(1-ease(frame,1458,1461));
  return <div data-video-safe="windows-taskbar" style={{position:'absolute',left:0,right:0,top:desktop.taskbarTop,height:desktop.taskbarHeight,opacity:presence,transform:`translateY(${76*(1-presence)}px)`,background:'linear-gradient(180deg,rgba(246,248,252,.96),rgba(230,235,242,.98))',borderTop:'1px solid rgba(255,255,255,.7)',boxShadow:'0 -8px 24px rgba(0,0,0,.09)',fontFamily:theme.chinese,color:'#343d49'}}>
    <div style={{position:'absolute',left:24,top:22,width:34,height:32,borderRadius:5,background:'#d0d8e4',display:'flex',gap:3,padding:5}}><div style={{width:8,background:'#a7b7cd',borderRadius:2}}/><div style={{flex:1,display:'grid',gap:3}}><div style={{background:'#f2f5fa',borderRadius:2}}/><div style={{background:'#f2f5fa',borderRadius:2}}/></div></div>
    <div style={{position:'absolute',left:853,top:23,display:'grid',gridTemplateColumns:'14px 14px',gridTemplateRows:'14px 14px',gap:3}}>{[0,1,2,3].map(i=><div key={i} style={{background:'#297ad9'}}/>)}</div>
    <svg style={{position:'absolute',left:922,top:24}} width="31" height="31" viewBox="0 0 24 24" fill="none" stroke="#536171" strokeWidth="1.7"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></svg>
    <svg style={{position:'absolute',left:992,top:24}} width="32" height="30" viewBox="0 0 28 26" fill="none" stroke="#65778b" strokeWidth="1.5"><rect x="2" y="3" width="16" height="15" rx="2"/><rect x="10" y="9" width="16" height="15" rx="2" fill="#e9eef6"/></svg>
    <svg style={{position:'absolute',left:1062,top:23}} width="34" height="32" viewBox="0 0 32 28"><path d="M2 5h11l3 4h14v16H2z" fill="#d8b95b"/><path d="M2 12h28v13H2z" fill="#e6ca72"/><path d="M4 10h24v3H4z" fill="#8bacc9"/></svg>
    <SystemIcon kind="up" x={1630}/>
    <div data-video-safe="token-meter-tray" style={{position:'absolute',left:desktop.trayX-23,top:15,width:46,height:46,borderRadius:8,display:'grid',placeItems:'center',background:`rgba(85,146,238,${.14*hover})`,transform:`scale(${1-.08*press})`}}><Logo frame={200} size={30}/></div>
    <SystemIcon kind="wifi" x={1674}/><SystemIcon kind="volume" x={1714}/>
    <div style={{position:'absolute',right:18,top:13,textAlign:'right',fontSize:16,lineHeight:1.5}}><div>12:00</div><div>2026/10/09</div></div>
    <div style={{position:'absolute',right:2,top:10,bottom:10,width:1,background:'rgba(98,111,130,.18)'}}/>
  </div>;
};

export const TrayInteraction: React.FC<{frame:number}> = ({frame}) => {
  const opening = ease(frame,382,390)*(1-ease(frame,424,438));
  const closing = ease(frame,1430,1440)*(1-ease(frame,1494,1512));
  const p = frame<700 ? ease(frame,382,398) : ease(frame,1430,1452);
  const x = lerp(frame<700 ? 1550 : 1840,desktop.trayX,p);
  const y = lerp(frame<700 ? 824 : 877,desktop.trayY,p);
  const click = frame<700 ? desktop.openClick : desktop.closeClick;
  const ripple = progress(frame,click,click+15);
  const rippleVisible = frame>=click&&frame<click+15;
  const labelStart = frame<700 ? 370 : 1430;
  const labelExit = frame<700 ? 414 : 1482;
  const labelEnter = smoothRange(frame,labelStart,labelStart+12);
  const labelLeave = smoothRange(frame,labelExit,labelExit+12);
  const labelOpacity = labelEnter*(1-labelLeave);
  return <>
    {rippleVisible&&<div style={{position:'absolute',left:desktop.trayX,top:desktop.trayY,width:lerp(14,58,ripple),height:lerp(14,58,ripple),transform:'translate(-50%,-50%)',border:'2px solid #5592ee',borderRadius:'50%',opacity:1-ripple}}/>}
    <svg data-video-safe="demo-cursor" width="28" height="36" viewBox="0 0 28 36" style={{position:'absolute',left:x,top:y,opacity:Math.max(opening,closing),filter:'drop-shadow(0 1px 2px #0004)'}}><path d="M2 2v27l7-6 5 11 5-2-5-11h10z" fill="#fff" stroke="#202630" strokeWidth="1.5" strokeLinejoin="round"/></svg>
    <div data-video-safe="tray-instruction" style={{position:'absolute',left:122,top:873,fontSize:28,color:'#d4dfed',opacity:labelOpacity,transform:`translateY(${6*(1-labelEnter)-4*labelLeave}px)`}}>{frame<700 ? '点击托盘图标，向上展开。' : '再次点击托盘，向下收起。'}</div>
  </>;
};
