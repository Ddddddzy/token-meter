import React from 'react';
import {backdropPresence, desktopBackdropURI} from '../desktop-backdrop';
export const DesktopBackdrop: React.FC<{frame:number}> = ({frame}) => <div data-video-safe="synthetic-desktop" style={{position:'absolute',inset:0,height:1004,backgroundImage:`url("${desktopBackdropURI}")`,backgroundSize:'1920px 1004px',opacity:backdropPresence(frame)}}/>;
