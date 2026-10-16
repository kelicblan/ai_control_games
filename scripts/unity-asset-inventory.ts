import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Gltf {
  asset: { version: string }; accessors?: { count: number }[];
  meshes?: { primitives: { attributes: { POSITION: number }; indices?: number; mode?: number }[] }[];
  nodes?: { mesh?: number }[]; skins?: unknown[]; animations?: { name?: string }[];
  materials?: unknown[]; textures?: unknown[]; images?: { uri?: string }[];
}
export function inspectGlb(data: Buffer) {
  if (data.length < 20 || data.readUInt32LE(0) !== 0x46546c67 || data.readUInt32LE(4) !== 2 || data.readUInt32LE(8) !== data.length) throw new Error('Invalid GLB header');
  let gltf: Gltf | undefined;
  for (let offset = 12; offset < data.length;) {
    if (offset + 8 > data.length) throw new Error('Truncated GLB chunk');
    const length = data.readUInt32LE(offset), type = data.readUInt32LE(offset + 4);
    if (length % 4 !== 0 || offset + 8 + length > data.length) throw new Error('Invalid GLB chunk length');
    if (type === 0x4e4f534a) {
      if (gltf) throw new Error('Duplicate GLB JSON chunk');
      gltf = JSON.parse(data.subarray(offset + 8, offset + 8 + length).toString('utf8').trim()) as Gltf;
    }
    offset += 8 + length;
  }
  if (!gltf || gltf.asset?.version !== '2.0') throw new Error('Missing GLB 2.0 JSON');
  let vertices = 0, triangles = 0, primitives = 0;
  const count = (index: number) => {
    const accessor = gltf!.accessors?.[index];
    if (!accessor || !Number.isSafeInteger(accessor.count) || accessor.count < 0) throw new Error('Invalid geometry accessor');
    return accessor.count;
  };
  for (const mesh of gltf.meshes ?? []) for (const primitive of mesh.primitives) {
    const positions = count(primitive.attributes.POSITION), indices = primitive.indices === undefined ? positions : count(primitive.indices);
    const mode = primitive.mode ?? 4;
    vertices += positions; primitives++;
    triangles += mode === 4 ? Math.floor(indices / 3) : mode === 5 || mode === 6 ? Math.max(0, indices - 2) : 0;
  }
  return { meshes: gltf.meshes?.length ?? 0, primitives, vertices, triangles,
    meshInstances: gltf.nodes?.filter(node => node.mesh !== undefined).length ?? 0,
    skins: gltf.skins?.length ?? 0, animations: gltf.animations?.length ?? 0,
    animationNames: (gltf.animations ?? []).map((animation, index) => animation.name ?? `clip-${index}`),
    materials: gltf.materials?.length ?? 0, textures: gltf.textures?.length ?? 0,
    externalImages: (gltf.images ?? []).flatMap(image => image.uri && !image.uri.startsWith('data:') ? [image.uri] : []) };
}
export function inventoryAssets(root: string) {
  const rows: { file: string; bytes: number; sha256: string; geometry: ReturnType<typeof inspectGlb> }[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.name.toLowerCase().endsWith('.glb')) {
        const data = readFileSync(file);
        rows.push({ file: path.relative(root, file).replaceAll('\\', '/'), bytes: data.length,
          sha256: createHash('sha256').update(data).digest('hex'), geometry: inspectGlb(data) });
      }
    }
  };
  visit(path.join(root, 'public/assets/models'));
  return rows;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? '.'), output = path.join(root, 'docs/unity-migration');
  mkdirSync(output, { recursive: true });
  const rows = inventoryAssets(root);
  writeFileSync(path.join(output, 'asset-inventory.json'), JSON.stringify({ version: 1, note: 'Unique source geometry, not rendered draw calls. Unity import/LOD/visual checks pending.', assets: rows }, null, 2) + '\n');
  const csv = (value: unknown) => '"' + String(value).replaceAll('"', '""') + '"';
  const header = ['file', 'bytes', 'sha256', 'meshes', 'primitives', 'vertices', 'triangles', 'skins', 'animations', 'materials', 'textures', 'unityImport'];
  const lines = rows.map(row => [row.file, row.bytes, row.sha256, ...header.slice(3, -1).map(key => row.geometry[key as keyof typeof row.geometry]), 'pending'].map(csv).join(','));
  writeFileSync(path.join(output, 'asset-manifest.csv'), header.join(',') + '\n' + lines.join('\n') + '\n');
  console.log(`Audited ${rows.length} source GLB assets; Unity import not yet verified`);
}
