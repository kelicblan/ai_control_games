import fs from 'node:fs';
import path from 'node:path';
import { Object3D, Quaternion, Vector3 } from 'three';

// Bake two original in-place clips for the verified Tripo cultivator skeleton.
const input = process.argv[2] ?? '../模型/3d模型/修真领主/领主-修真者-已绑骨.glb';
const output = 'public/assets/models/lord/model.glb';
const bytes = fs.readFileSync(input), jsonLength = bytes.readUInt32LE(12);
const doc = JSON.parse(bytes.subarray(20, 20 + jsonLength));
if (doc.skins?.[0]?.joints.length !== 82 || doc.nodes[51]?.name !== 'bone_51') throw new Error('Unexpected lord skeleton');
const chunks = [bytes.subarray(28 + jsonLength, 28 + jsonLength + doc.buffers[0].byteLength)];
let offset = chunks[0].length;
const objects = doc.nodes.map(n => {
  const o = new Object3D();
  if (n.translation) o.position.fromArray(n.translation);
  if (n.rotation) o.quaternion.fromArray(n.rotation);
  if (n.scale) o.scale.fromArray(n.scale);
  if (n.matrix) { o.matrix.fromArray(n.matrix); o.matrix.decompose(o.position, o.quaternion, o.scale); }
  return o;
});
doc.nodes.forEach((n, i) => (n.children ?? []).forEach(c => objects[i].add(objects[c])));
objects.forEach(o => o.updateWorldMatrix(true, false));
function accessor(values, size, type) {
  const pad = (4 - offset % 4) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  const floats = new Float32Array(values), data = Buffer.from(floats.buffer);
  const view = doc.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length }) - 1;
  chunks.push(data); offset += data.length;
  const a = { bufferView: view, componentType: 5126, count: values.length / size, type };
  if (size === 1) { a.min = [Math.min(...values)]; a.max = [Math.max(...values)]; }
  return doc.accessors.push(a) - 1;
}
const axisX = new Vector3(1, 0, 0), axisZ = new Vector3(0, 0, 1);
function clip(name, duration, walk) {
  const frames = Math.round(duration * 30), times = Array.from({ length: frames + 1 }, (_, i) => i * duration / frames);
  const input = accessor(times, 1, 'SCALAR'), animation = { name, samplers: [], channels: [] };
  function track(node, property, values, size, type) {
    const sampler = animation.samplers.push({ input, output: accessor(values, size, type), interpolation: 'LINEAR' }) - 1;
    animation.channels.push({ sampler, target: { node, path: property } });
  }
  // The source faces +X; its lateral axis is Z. These are anatomical joints,
  // identified from world-space positions, rather than unreliable generated names.
  const joints = [47, 46, 4, 24, 44, 51, 55, 50, 54, 49, 53, 59, 63, 67, 71, 75, 79];
  for (const node of joints) {
    const parent = objects[node].parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
    const inverse = parent.clone().invert(), rest = objects[node].quaternion;
    const values = [];
    for (let f = 0; f <= frames; f++) {
      const phase = (f === frames ? 0 : f / frames) * Math.PI * 2;
      let swing = 0, lowerArm = 0;
      if (node === 47) swing = Math.sin(phase) * (walk ? .018 : .008);
      if (node === 46 || node === 4) swing = Math.sin(phase + .4) * .012;
      if (node === 24 || node === 44) {
        const side = node === 24 ? 1 : -1;
        lowerArm = side * .24;
        swing = Math.sin(phase) * side * (walk ? .13 : .012);
      }
      if (node === 51 || node === 55) swing = Math.sin(phase) * (node === 51 ? 1 : -1) * (walk ? .28 : 0);
      if (node === 50 || node === 54) swing = walk ? -Math.max(0, Math.sin(phase + (node === 50 ? 0 : Math.PI))) * .36 : 0;
      if (node === 49 || node === 53) swing = walk ? Math.max(0, Math.sin(phase + (node === 49 ? 0 : Math.PI))) * .12 : 0;
      if (node >= 59) swing = Math.sin(phase + node * .4) * (walk ? .045 : .012);
      const delta = new Quaternion().setFromAxisAngle(axisZ, swing).multiply(new Quaternion().setFromAxisAngle(axisX, lowerArm));
      const q = inverse.clone().multiply(delta).multiply(parent).multiply(rest).normalize();
      values.push(...q.toArray());
    }
    track(node, 'rotation', values, 4, 'VEC4');
  }
  const rest = objects[81].position, positions = [];
  for (let f = 0; f <= frames; f++) {
    const phase = (f === frames ? 0 : f / frames) * Math.PI * 2;
    positions.push(rest.x, rest.y + (walk ? (1 - Math.cos(phase * 2)) * .0015 : Math.sin(phase) * .0008), rest.z);
  }
  track(81, 'translation', positions, 3, 'VEC3');
  return animation;
}
doc.animations = [clip('Idle', 3.2, false), clip('Walk', .88, true)];
doc.extras = { ...doc.extras, animationAuthor: 'Local original skeletal animation; Tripo model and skin', forwardAxis: '+X' };
doc.buffers[0].byteLength = offset;
const binary = Buffer.concat(chunks), json = Buffer.from(JSON.stringify(doc));
const jsonPad = (4 - json.length % 4) % 4, binPad = (4 - binary.length % 4) % 4;
const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + jsonPad + binary.length + binPad, 8);
jh.writeUInt32LE(json.length + jsonPad); jh.writeUInt32LE(0x4e4f534a, 4);
bh.writeUInt32LE(binary.length + binPad); bh.writeUInt32LE(0x004e4942, 4);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, Buffer.concat([header, jh, json, Buffer.alloc(jsonPad, 32), bh, binary, Buffer.alloc(binPad)]));
console.log(JSON.stringify({ output, clips: doc.animations.map(a => a.name), bytes: fs.statSync(output).size }));
