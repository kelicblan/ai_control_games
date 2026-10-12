import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(root, process.argv[2] ?? 'dist');
const template = await readFile(path.join(root, 'public/sw.js'), 'utf8');
const versionMarker = '__CAMPMIND_BUILD_VERSION__';
const assetsMarker = '/* __CAMPMIND_PRECACHE_FILES__ */ []';
if (!template.includes(versionMarker) || !template.includes(assetsMarker)) {
  throw new Error('Service worker template markers are missing.');
}

async function filesIn(directory, prefix = '') {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isSymbolicLink()) throw new Error(`Unexpected symlink in production output: ${relative}`);
    if (item.isDirectory()) files.push(...await filesIn(path.join(directory, item.name), relative));
    else if (item.isFile() && relative !== 'sw.js') files.push(relative);
  }
  return files.sort();
}

const files = await filesIn(output);
if (!files.includes('index.html')) throw new Error('Build output must contain index.html before generating its offline cache.');
if (files.length > 512) throw new Error('Build has more than 512 files; review the offline cache budget before expanding it.');
const hash = createHash('sha256').update(template);
for (const file of files) {
  hash.update('\0').update(file).update('\0').update(await readFile(path.join(output, file)));
}
const version = hash.digest('hex').slice(0, 16);
const manifest = files.map(file => `./${file.split('/').map(encodeURIComponent).join('/')}`);
const generated = template.replace(versionMarker, version).replace(assetsMarker, JSON.stringify(manifest));
await writeFile(path.join(output, 'sw.js'), generated);
console.log(`Offline cache ${version}: ${files.length} same-origin files, including all bundled game/model assets.`);
