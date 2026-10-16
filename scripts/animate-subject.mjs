import fs from 'node:fs';
import path from 'node:path';
import { Object3D, Quaternion, Vector3 } from 'three';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/animate-subject.mjs input.glb output.glb');
const bytes = fs.readFileSync(input), jsonLength = bytes.readUInt32LE(12), doc = JSON.parse(bytes.subarray(20, 20 + jsonLength));
const chunks = [bytes.subarray(28 + jsonLength, 28 + jsonLength + doc.buffers[0].byteLength)]; let offset = chunks[0].length;
const objects = doc.nodes.map(n => {
  const o = new Object3D(); if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale);
  if (n.matrix) { o.matrix.fromArray(n.matrix); o.matrix.decompose(o.position, o.quaternion, o.scale); } return o;
});
doc.nodes.forEach((n, i) => (n.children ?? []).forEach(c => objects[i].add(objects[c])));
objects.forEach(o => o.updateWorldMatrix(true, false));
const joints = new Set(doc.skins[0].joints), children = i => (doc.nodes[i]?.children ?? []).filter(c => joints.has(c));
const p = i => objects[i].getWorldPosition(new Vector3());
const root = doc.skins[0].joints[0], branches = children(root);
const highest = i => Math.max(p(i).y, ...children(i).map(highest));
const descendants = i => children(i).reduce((count, c) => count + 1 + descendants(c), 0);
const continuation = i => [...children(i)].sort((a, b) => descendants(b) - descendants(a))[0];
const spine = [...branches].sort((a, b) => highest(b) - highest(a))[0];
let chest = spine;
while (children(chest).length && children(chest).filter(i => p(i).y > p(chest).y - .04).length < 3) chest = [...children(chest)].sort((a, b) => p(b).y - p(a).y)[0];
const head = [...children(chest)].sort((a, b) => p(b).y - p(a).y)[0];
const shoulders = children(chest).filter(i => i !== head).sort((a, b) => p(a).z - p(b).z);
const lowest = i => Math.min(p(i).y, ...children(i).map(lowest));
const legs = [...joints].filter(i => p(i).y > .4 && p(i).y < .65 && !children(i).some(c => p(c).y > p(i).y + .05) && children(i).some(c => p(c).y < p(i).y - .08 && lowest(c) < .12))
  .sort((a, b) => Math.abs(p(a).x) + Math.abs(p(a).z) - Math.abs(p(b).x) - Math.abs(p(b).z)).slice(0, 2).sort((a, b) => p(a).z - p(b).z);
const map = { Root: root, Spine: spine, Chest: chest, Head: head };
for (const [n, i] of [['Left', 0], ['Right', 1]]) {
  const upper = continuation(shoulders[i]), elbow = continuation(upper), hand = continuation(elbow);
  const knee = [...children(legs[i])].sort((a, b) => lowest(a) - lowest(b))[0], foot = [...children(knee)].sort((a, b) => lowest(a) - lowest(b))[0];
  Object.assign(map, { [`${n}Arm`]: upper, [`${n}ForeArm`]: elbow, [`${n}Hand`]: hand, [`${n}UpLeg`]: legs[i], [`${n}Leg`]: knee, [`${n}Foot`]: foot });
}
const containsLeg = i => legs.includes(i) || children(i).some(containsLeg);
branches.filter(i => i !== spine && !containsLeg(i)).forEach((i, n) => { map[`Cloth${n}`] = i; });
if (Object.values(map).some(i => i === undefined) || p(map.Head).y < .6 || p(map.LeftFoot).y > .2 || p(map.RightFoot).y > .2) throw new Error('Unrecognized anatomy; inspect this skeleton before animating');
for (const [name, index] of Object.entries(map)) doc.nodes[index].name = name;
function accessor(values, size, type) {
  const pad = (4 - offset % 4) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  const data = Buffer.from(new Float32Array(values).buffer), view = doc.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length }) - 1;
  chunks.push(data); offset += data.length;
  const a = { bufferView: view, componentType: 5126, count: values.length / size, type };
  if (size === 1) { a.min = [Math.min(...values)]; a.max = [Math.max(...values)]; }
  return doc.accessors.push(a) - 1;
}
const axisX = new Vector3(1, 0, 0), axisZ = new Vector3(0, 0, 1);
function clip(name, duration) {
  const frames = Math.round(duration * 30), times = Array.from({ length: frames + 1 }, (_, i) => i * duration / frames);
  const input = accessor(times, 1, 'SCALAR'), animation = { name, samplers: [], channels: [] };
  const walk = name === 'Walk' || name === 'WalkCarry', carry = name.includes('Carry');
  function track(node, property, values, size, type) {
    const sampler = animation.samplers.push({ input, output: accessor(values, size, type), interpolation: 'LINEAR' }) - 1;
    animation.channels.push({ sampler, target: { node, path: property } });
  }
  for (const [label, node] of Object.entries(map)) {
    if (label === 'Root' || label.endsWith('Hand')) continue;
    const parent = objects[node].parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion(), inverse = parent.clone().invert(), rest = objects[node].quaternion;
    const values = [];
    for (let f = 0; f <= frames; f++) {
      const phase = (f === frames ? 0 : f / frames) * Math.PI * 2, side = label.startsWith('Right') ? 1 : -1;
      let swing = 0, lower = 0;
      if (label === 'Spine') swing = Math.sin(phase) * .012 + (name === 'Gather' ? -.18 : name === 'Work' ? -.08 : name === 'Rest' ? .035 : 0);
      if (label === 'Chest' || label === 'Head') swing = Math.sin(phase + .4) * .012;
      if (label.startsWith('Cloth')) swing = Math.sin(phase + node * .4) * (walk ? .035 : .012);
      if (label.endsWith('Arm') && !label.endsWith('ForeArm')) {
        const limb = p(map[`${label.startsWith('Right') ? 'Right' : 'Left'}ForeArm`]).sub(p(node));
        const restAngle = Math.atan2(Math.abs(limb.z), -limb.y);
        lower = side * Math.max(0, restAngle - .3); swing = walk ? -Math.sin(phase) * side * .2 : Math.sin(phase) * side * .014;
        if (carry) { lower = side * Math.max(0, restAngle - .1); swing = .78; }
        if (name === 'Work') { lower = side * Math.max(0, restAngle - .15); swing = .7 + Math.sin(phase) * .55; }
        if (name === 'Gather') { lower = side * Math.max(0, restAngle - .2); swing = .55 + Math.sin(phase) * .18; }
      }
      if (label.endsWith('ForeArm')) {
        if (carry) swing = .35;
        if (name === 'Work') swing = .18 + Math.sin(phase + .5) * .18;
        if (name === 'Gather') swing = .18 + Math.sin(phase) * .15;
      }
      if (label.endsWith('UpLeg')) swing = walk ? Math.sin(phase) * side * .33 : 0;
      if (label.endsWith('Leg') && !label.endsWith('UpLeg')) swing = walk ? -Math.max(0, Math.sin(phase + (side === 1 ? 0 : Math.PI))) * .45 : 0;
      if (label.endsWith('Foot')) swing = walk ? Math.max(0, Math.sin(phase + (side === 1 ? 0 : Math.PI))) * .14 : 0;
      const delta = new Quaternion().setFromAxisAngle(axisZ, swing).multiply(new Quaternion().setFromAxisAngle(axisX, lower));
      const q = inverse.clone().multiply(delta).multiply(parent).multiply(rest).normalize(); values.push(...q.toArray());
    }
    track(node, 'rotation', values, 4, 'VEC4');
  }
  const rest = objects[root].position, positions = [];
  for (let f = 0; f <= frames; f++) {
    const phase = (f === frames ? 0 : f / frames) * Math.PI * 2;
    positions.push(rest.x, rest.y + (walk ? (1 - Math.cos(phase * 2)) * .002 : Math.sin(phase) * .0008), rest.z);
  }
  track(root, 'translation', positions, 3, 'VEC3'); return animation;
}
doc.animations = [['Idle', 3.2], ['Walk', .9], ['Work', 1.25], ['Gather', 2], ['Rest', 4], ['Carry', 3.2], ['WalkCarry', .9]].map(([name, duration]) => clip(name, duration));
doc.extras = { ...doc.extras, animationAuthor: 'Local original skeletal animation', anatomicalNodes: map, forwardAxis: '+X' };
doc.buffers[0].byteLength = offset;
const binary = Buffer.concat(chunks), json = Buffer.from(JSON.stringify(doc)), jp = (4 - json.length % 4) % 4, bp = (4 - binary.length % 4) % 4;
const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + jp + binary.length + bp, 8);
jh.writeUInt32LE(json.length + jp); jh.writeUInt32LE(0x4e4f534a, 4); bh.writeUInt32LE(binary.length + bp); bh.writeUInt32LE(0x004e4942, 4);
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, Buffer.concat([header, jh, json, Buffer.alloc(jp, 32), bh, binary, Buffer.alloc(bp)]));
console.log(JSON.stringify({ output, clips: doc.animations.map(a => a.name), anatomy: Object.fromEntries(Object.entries(map).map(([name, i]) => [name, { index: i, position: p(i).toArray() }])) }, null, 2));
