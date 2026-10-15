import fs from 'node:fs';
import { Object3D, Vector3 } from 'three';
const bytes = fs.readFileSync(process.argv[2]), doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
const objects = doc.nodes.map(n => {
  const o = new Object3D(); if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale);
  if (n.matrix) { o.matrix.fromArray(n.matrix); o.matrix.decompose(o.position, o.quaternion, o.scale); } return o;
});
doc.nodes.forEach((n, i) => (n.children ?? []).forEach(c => objects[i].add(objects[c])));
objects.forEach(o => o.updateWorldMatrix(true, false));
for (const i of doc.skins[0].joints) console.log(JSON.stringify({ i, name: doc.nodes[i].name, p: objects[i].getWorldPosition(new Vector3()).toArray().map(v => +v.toFixed(3)), children: doc.nodes[i].children }));
