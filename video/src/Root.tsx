import React from 'react';
import {Composition} from 'remotion';
import {Pilot} from './Pilot';
import {Film} from './Film';
import {Cover} from './Cover';
import {VIDEO} from './theme';

export const Root: React.FC = () => <>
  <Composition id="TokenMeterPilot" component={Pilot} durationInFrames={VIDEO.pilotFrames} fps={VIDEO.fps} width={VIDEO.width} height={VIDEO.height}/>
  <Composition id="TokenMeterFilm" component={Film} durationInFrames={1800} fps={VIDEO.fps} width={VIDEO.width} height={VIDEO.height}/>
  <Composition id="TokenMeterCover" component={Cover} durationInFrames={1} fps={VIDEO.fps} width={VIDEO.width} height={VIDEO.height}/>
</>;
