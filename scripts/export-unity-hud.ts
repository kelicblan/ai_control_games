import {createRequire} from 'node:module';
import {mkdirSync,copyFileSync} from 'node:fs';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as Icons from 'lucide-react';
import {Portrait} from '../src/components/ui';
const require=createRequire(import.meta.url);
const sharp=require(require.resolve('sharp',{paths:[process.env.CAMPMIND_IMAGE_PACKAGES||'C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const output=path.resolve('native/CampMind.Unity/Assets/CampMind/Resources/Hud');mkdirSync(output,{recursive:true});
await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect x="1" y="1" width="62" height="62" rx="12" fill="white"/></svg>')).png().toFile(path.join(output,'rounded.png'));
for(const name of ['Flame','Axe','Apple','BedDouble','HeartHandshake','Compass','MapPin','Settings','Volume2','VolumeX','CircleHelp','BookOpen','House','Pause','Play','Sun','Users','Footprints','Leaf','Sparkles','BrainCircuit','ArrowRight','Sunrise','Sunset','Moon','CloudRain','CloudLightning','Wind','Utensils','Megaphone','Heart','HeartPulse','HeartCrack','ChevronRight','ChevronUp','Check','X','MessageCircle','BarChart3','RotateCcw','CodeXml','Cpu','Star','MousePointer2','Network','Braces','Download','Activity','ArrowUpRight','RefreshCw','ShieldCheck','Camera','ZoomIn','ZoomOut','Umbrella','Waves']){
 const markup=renderToStaticMarkup(React.createElement((Icons as any)[name],{color:'#ffffff',size:64,strokeWidth:1.8}));
 await sharp(Buffer.from(markup)).png().toFile(path.join(output,name+'.png'));
}
for(const name of ['Flame','Pause','Play']){const markup=renderToStaticMarkup(React.createElement((Icons as any)[name],{color:'#ffffff',fill:'#ffffff',size:64,strokeWidth:1.8}));await sharp(Buffer.from(markup)).png().toFile(path.join(output,name+'Fill.png'));}
const sheet=sharp('public/assets/characters.png');const size=await sheet.metadata();
for(const [index,id] of ['azhuang','xiaomi','laozhou'].entries())await sheet.clone().extract({left:Math.round(index*size.width/3),top:0,width:Math.floor(size.width/3),height:Math.floor(size.height/2)}).resize(90,100).png().toFile(path.join(output,id+'.png'));
for(const id of ['linlan','aye','tiesheng','aling','xiaoman','shenyan']){
 const markup=renderToStaticMarkup(React.createElement(Portrait,{id:id as any}));const svg=markup.match(/<svg[\s\S]*<\/svg>/)?.[0];if(!svg)throw new Error('Missing original portrait '+id);
 await sharp(Buffer.from(svg)).resize(90,100).png().toFile(path.join(output,id+'.png'));
}
copyFileSync('public/assets/camp.png',path.join(output,'journey.png'));
copyFileSync('node_modules/lucide-react/LICENSE',path.join(output,'Lucide-LICENSE.txt'));
console.log('Exported original React portraits, Lucide icons and journey artwork');
