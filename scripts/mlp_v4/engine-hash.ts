import { readFileSync,readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
export function lifeEngineHash() {
  const hash = createHash('sha256');
  // Initial scenario layouts are dataset provenance, not a change to executor semantics.
  const folders=['src/games/camp/village/ai','src/games/camp/village/systems','src/games/camp/village/social','src/games/camp/village/config','packages/action-runtime/src','packages/social-core/src','packages/policy-runtime/src','src/games/camp/animals'];
  const files=folders.flatMap(folder=>readdirSync(fileURLToPath(new URL(`../../${folder}`,import.meta.url))).filter(f=>/\.(ts|json)$/.test(f)).map(f=>`${folder}/${f}`));
  files.push(...['actors','types','economy','stats','state','economy-validation','combat','combat-validation','extensions-validation','history'].map(f=>`src/games/camp/village/domain/${f}.ts`));
  files.push('config/animals/ecology-v2.json','scripts/mlp_v4/engine-hash.ts','packages/world-core/src/steering.ts');
  for(const file of files.sort()){hash.update(file);hash.update(readFileSync(fileURLToPath(new URL(`../../${file}`,import.meta.url)),'utf8').replace(/\r\n/g,'\n'));}
  return hash.digest('hex');
}
