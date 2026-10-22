/** 用正式启动链和真实世界宿主采集原生画面；不向世界写入调试坐标。 */
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchGame} from '../pixel-world/launch.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const group=process.argv.includes('--reference-v2')?'reference-visual-v2':'tinyswords-map';
const capture=path.join(root,'native/Artifacts',group,'visual-'+Date.now());mkdirSync(capture,{recursive:true});
console.log('原生画面验证目录：'+capture);
await launchGame({spawnPlayer:(executable,args,options)=>spawn(executable,[...args,'-screen-fullscreen','0','-screen-width','1600','-screen-height','1100','-pixel-visual-probe','-pixel-capture-dir',capture],options)});
