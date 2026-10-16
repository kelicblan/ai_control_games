import {HelpDialog} from '../src/components/HelpDialog';
import {FEATURE_NAMES} from '../src/games/camp/simulation/observation';
import {ACTIONS} from '../src/games/camp/simulation/types';
import {PERSONAS} from '../src/games/camp/simulation/personalities';
import {CAMP_PROFILES} from '../src/games/camp/npc/profiles';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {CAMP_SETTINGS_CATALOG} from '../src/games/camp/settings/catalog';
import {defaultSettings} from '../packages/npc-settings/src';
import {createEnvironmentSamples,AMBIENT_SAMPLE_RATE,type TextureKind} from '../src/games/camp/simulation/ambient';
import {SOUNDS} from '../src/games/camp/simulation/audio';
import {createReactionSamples,NPC_VOICE_PROFILES,VOCAL_SAMPLE_RATE} from '../src/games/camp/simulation/vocal';
import type {NpcId,ReactionKind} from '../src/games/camp/simulation/types';
const root=path.resolve('native/CampMind.Unity/Assets/CampMind/Resources');mkdirSync(path.join(root,'Audio'),{recursive:true});
writeFileSync(path.join(root,'NpcSettingsCatalog.json'),JSON.stringify({catalog:CAMP_SETTINGS_CATALOG,defaults:defaultSettings(CAMP_SETTINGS_CATALOG)},null,2));
const helpRoot=HelpDialog({onClose:()=>{}}) as any;
function helpNodes(value:any):any[]{if(Array.isArray(value))return value.flatMap(helpNodes);if(!value||typeof value!=='object'||!value.props)return [];return [value,...helpNodes(value.props.children)];}
function helpText(value:any):string{if(value==null||typeof value==='boolean')return '';if(typeof value==='string'||typeof value==='number')return String(value);if(Array.isArray(value))return value.map(helpText).join('');if(value.type==='br')return '\n';return helpText(value.props?.children);}
const helpSections=helpNodes(helpRoot.props.children).filter(node=>node.type==='section'||node.props.className==='help-model').map(node=>{const children=helpNodes(node.props.children);return {title:helpText(children.find(child=>child.type==='h3'||child.type==='strong')),text:children.filter(child=>child.type==='p').map(helpText).join('\n'),icon:children.find(child=>child.type?.displayName)?.type.displayName??'Flame',boxed:node.props.className==='help-model'};});
writeFileSync(path.join(root,'HelpContent.json'),JSON.stringify({title:helpRoot.props.title,lead:helpText(helpRoot.props.children[0]),sections:helpSections}));
writeFileSync(path.join(root,'DecisionSchema.json'),JSON.stringify({features:FEATURE_NAMES,actions:ACTIONS}));
writeFileSync(path.join(root,'Personas.json'),JSON.stringify({personas:PERSONAS,profiles:CAMP_PROFILES}));
writeFileSync(path.join(root,'Audio','cue-tones.json'),JSON.stringify(SOUNDS));
function wav(samples:Float32Array,rate:number){const bytes=Buffer.alloc(44+samples.length*2);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples.length*2,40);for(let i=0;i<samples.length;i++)bytes.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),44+i*2);return bytes;}
for(const kind of ['wind','leaves','rain','water','fire','thunderBody','thunderCrack'] as TextureKind[])writeFileSync(path.join(root,'Audio',`${kind}.wav`),wav(createEnvironmentSamples(kind),AMBIENT_SAMPLE_RATE));
const fixtures=[];
for(const npc of Object.keys(NPC_VOICE_PROFILES) as NpcId[])for(const kind of ['burn','thorns','impact','water','bump'] as ReactionKind[])for(const intensity of [.1,.55,1]){
  const samples=createReactionSamples(kind,npc,intensity),indices=[0,1,17,97,337,997,2003,4001,samples.length-1];
  fixtures.push({npc,kind,intensity,length:samples.length,indices,values:indices.map(i=>samples[i])});
}
writeFileSync(path.join(root,'Audio','vocal-fixtures.json'),JSON.stringify({sampleRate:VOCAL_SAMPLE_RATE,profiles:NPC_VOICE_PROFILES,fixtures}));
console.log('Exported source NPC settings, seven environmental sounds, cue tones and 135 vocal parity cases');
