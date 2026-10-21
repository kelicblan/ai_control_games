import { readFileSync,writeFileSync,copyFileSync,renameSync,statSync,lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ensure } from '../../packages/action-runtime/src/json';
import {loadV4Bundle} from '../mlp_v4/load-bundle';
import {selectWorldRules} from '../../src/games/camp/village/config/load';
import {V4_SPEC} from '../../src/games/camp/village/ai/observation';
import {publishVillagePackage} from '../unity/village-package.mjs';
const root=process.cwd(),json=(f:string)=>JSON.parse(readFileSync(f,'utf8')),sha=(f:string)=>createHash('sha256').update(readFileSync(f)).digest('hex');
const [wide,tall,controls]=process.argv.slice(2).map(p=>path.resolve(p));
for(const run of [wide,tall,controls])ensure(run.startsWith(path.join(root,'native/Artifacts/slice-')),'Current native UI and controls reports required');
const build=json('native/Artifacts/village/P6/build.json'),marker='native/Builds/village-current.json',previous=json(marker);
ensure(build.success&&build.errors===0,'Current native build must succeed');
for(const run of [wide,tall,controls]){
  ensure(json(run+'/processes.json').executable===build.executable&&json(run+'/launcher-result.json').success,'Evidence must use the current executable');
  ensure(statSync(run+'/player.log').birthtimeMs>=Date.parse(build.builtUtc),'Evidence predates build');
  ensure(!/NullReferenceException|InvalidOperationException|failed to create (?:2D texture|buffer)/i.test(readFileSync(run+'/player.log','utf8')),'Unresolved native errors');
  ensure(!/"method":"POST","route":"\/game-api\/world","status":503/.test(readFileSync(run+'/world.log','utf8')),'Village UI leaked a command to the legacy world');
}
for(const run of [wide,tall]){const report=json(run+'/village-result.json');ensure(report.success&&report.classification==='ui-layout-only'&&report.coverage.includes('inline-reply'),'Both UI viewport probes must pass');}
const native=json(controls+'/village-result.json');
ensure(native.success&&native.defaultMode&&native.startupIncluded&&native.originalHudRetained&&native.keyboardMovementVerified&&native.modelSettingsVerified&&json(controls+'/village-persistence.json').success&&json(controls+'/village-resume.json').success,'Native operations and restarted persistence must pass');
const models=loadV4Bundle('public/models/village-v4',selectWorldRules('village-v1','p4-social-content-v1').ruleHash,V4_SPEC);
for(const head of ['life','tactical']as const)ensure(native.models[head].modelHash===models[head].manifest.sha256,'Native trained model mismatch');
ensure(previous.releaseHash===sha('public/models/village-v4/release.json'),'A concurrent model release needs separate acceptance');
const tests=json('native/Artifacts/ui-unified/runtime-tests.json');ensure(tests.numFailedTests===0&&tests.numPassedTests>=6,'Weather/runtime regressions must pass');
const qa=json('native/Artifacts/ui-unified/design-qa.json');ensure(qa.passed&&qa.wide===wide&&qa.tall===tall&&qa.remainingP0P1P2===0,'Current visual review must pass');
copyFileSync(marker,'native/Artifacts/ui-unified/deployment-before-reference.json');
const sources=['scripts/world/village-weather.ts','scripts/world/village-runtime.ts','scripts/world/server.ts','native/CampMind.Unity/Assets/CampMind/Presentation/TsWorldBridge.cs','native/CampMind.Unity/Assets/CampMind/Presentation/NativeGameUi.Reference.cs','native/CampMind.Unity/Assets/CampMind/Presentation/NativeGameUi.Channel.cs','native/CampMind.Unity/Assets/CampMind/Presentation/NativeVillageUi.cs'];
const current={...previous,executable:build.executable,executableHash:sha(build.executable),gameAssemblyHash:sha(path.join(path.dirname(build.executable),'GameAssembly.dll')),nativeProbe:path.relative(root,controls),promotedUtc:new Date().toISOString(),referenceUiUpdate:{wide:path.relative(root,wide),tall:path.relative(root,tall),controls:path.relative(root,controls),weather:true,inlineReply:true,qa:'design-qa.md',previousManifest:'native/Artifacts/ui-unified/deployment-before-reference.json',nineCompanionFunctionalVerified:false}};
Object.assign(current.referenceUiUpdate,{legacyMotionGuard:true,sourceExecutable:build.executable,sourceFiles:Object.fromEntries(sources.map(f=>[f,sha(f)]))});
const packageRoot=path.resolve(root,'native/Builds');ensure(packageRoot.startsWith(root+path.sep)&&!lstatSync(packageRoot).isSymbolicLink(),'Publication must stay in this checkout');current.executable=publishVillagePackage(root,build.executable,current,packageRoot);
writeFileSync(marker+'.ui.tmp',JSON.stringify(current,null,2));renameSync(marker+'.ui.tmp',marker);writeFileSync('native/Artifacts/ui-unified/deployment-reference.json',JSON.stringify(current,null,2));writeFileSync('native/Artifacts/village/P6/build.json',JSON.stringify({...build,modelsPending:false,defaultModeVerified:true,publishedExecutable:current.executable,nativeProbe:current.nativeProbe,models:current.models},null,2));console.log(JSON.stringify({success:true,executable:current.executable}));
