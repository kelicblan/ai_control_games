import { copyFile, mkdir, readFile, access, writeFile, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'public/minimind');
await mkdir(output, { recursive: true });
for (const [source, target] of [
  ['node_modules/@wllama/wllama/esm/wasm/wllama.wasm', 'wllama.wasm'],
  ['node_modules/@wllama/wllama-compat/wasm/wllama.wasm', 'compat.wasm'],
  ['node_modules/@wllama/wllama/LICENCE', 'wllama-LICENSE.txt'],
  ['minimind3/minimind/LICENSE', 'MiniMind-LICENSE.txt'],
]) await copyFile(path.join(root, source), path.join(output, target));
const manifest = JSON.parse(await readFile(path.join(root, 'minimind3/assets-manifest.json'), 'utf8'));
const file = 'minimind-3.q8.gguf';
const target = path.join(output, file);
let source = path.join(root, 'minimind3/model', file);
try { await access(source); } catch {
  try { await access(target); source = target; } catch {
    if (!process.argv.includes('--download')) {
      await writeFile(path.join(output, 'model.json'), JSON.stringify({ available: false }));
      console.log('MiniMind WASM staged. Model absent: run npm run npc:setup to download the pinned GGUF.');
      process.exit(0);
    }
    const response = await fetch(manifest.modelUrl, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== manifest.files[`model/${file}`]) throw new Error('Model SHA-256 mismatch');
    await writeFile(`${target}.part`, bytes); await rename(`${target}.part`, target); source = target;
  }
}
const bytes = await readFile(source);
if (bytes.length !== 68189920 || createHash('sha256').update(bytes).digest('hex') !== manifest.files[`model/${file}`]) throw new Error('Local MiniMind model failed integrity check');
if (source !== target) {
  let matches = false;
  try { matches = createHash('sha256').update(await readFile(target)).digest('hex') === manifest.files[`model/${file}`]; } catch { }
  if (!matches) {
    await copyFile(source, `${target}.part`);
    // Windows cannot replace an existing open destination via rename; valid files are never replaced.
    await rm(target, { force: true }); await rename(`${target}.part`, target);
  } else await rm(`${target}.part`, { force: true });
}
await writeFile(path.join(output, 'model.json'), JSON.stringify({ available: true, file, sha256: manifest.files[`model/${file}`] }));
console.log('MiniMind WASM + verified 68.19 MB Q8 model staged (static resources, no inference service).');
