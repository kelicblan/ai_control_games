import {
  BoxGeometry, BufferGeometry, CapsuleGeometry, Color, ConeGeometry, CylinderGeometry,
  Euler, Float32BufferAttribute, Group, IcosahedronGeometry, Matrix4, Mesh,
  MeshStandardMaterial, Quaternion, SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import type { Material, MeshStandardMaterialParameters, Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TAU = Math.PI * 2;
export type XYZ = readonly [number, number, number];

export function seeded(seed = 29) {
  let value = seed >>> 0;
  return () => { value += 0x6d2b79f5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/** Shared primitives remain genuinely three dimensional; static instances are merged below. */
export class Shapes {
  sphere = new SphereGeometry(1, 12, 9);
  flower = new SphereGeometry(1, 6, 4);
  smoothSphere = new SphereGeometry(1, 20, 14);
  rock = new IcosahedronGeometry(1, 1);
  pebble = new IcosahedronGeometry(1, 0);
  cylinder = new CylinderGeometry(1, 1, 1, 10);
  taper = new CylinderGeometry(.62, 1, 1, 10);
  cone = new ConeGeometry(1, 1, 8);
  box = new BoxGeometry(1, 1, 1);
  capsule = new CapsuleGeometry(.5, 1, 4, 10);
  torus = new TorusGeometry(1, .075, 5, 22);
  halfSphere = new SphereGeometry(1, 16, 10, 0, TAU, 0, Math.PI * .55);
  dispose() { for (const shape of Object.values(this)) if (shape instanceof BufferGeometry) shape.dispose(); }
}

export function material(color: string | number, options: MeshStandardMaterialParameters = {}) {
  return new MeshStandardMaterial({ color, roughness: .92, metalness: 0, ...options });
}

export function addMesh(parent: Object3D, geometry: BufferGeometry, mat: Material, position: XYZ = [0, 0, 0], scale: XYZ = [1, 1, 1], rotation: XYZ = [0, 0, 0]) {
  const mesh = new Mesh(geometry, mat);
  mesh.position.set(...position); mesh.scale.set(...scale); mesh.rotation.set(...rotation);
  mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Collapses thousands of static details to one draw per material. */
export class StaticBatch {
  private parts = new Map<Material, BufferGeometry[]>();
  private matrix = new Matrix4();
  private position = new Vector3();
  private scale = new Vector3();
  private quaternion = new Quaternion();
  private euler = new Euler();
  add(geometry: BufferGeometry, mat: Material, position: XYZ = [0, 0, 0], scale: XYZ = [1, 1, 1], rotation: XYZ = [0, 0, 0]) {
    this.position.set(...position); this.scale.set(...scale); this.euler.set(...rotation); this.quaternion.setFromEuler(this.euler);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    const copy = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const key of Object.keys(copy.attributes)) if (key !== 'position' && key !== 'normal') copy.deleteAttribute(key);
    if (!copy.getAttribute('normal')) copy.computeVertexNormals();
    copy.applyMatrix4(this.matrix);
    const list = this.parts.get(mat) ?? []; list.push(copy); this.parts.set(mat, list);
  }
  branch(geometry: BufferGeometry, mat: Material, start: XYZ, end: XYZ, radius: number, endRadiusScale = 1) {
    const a = new Vector3(...start), b = new Vector3(...end);
    const direction = b.clone().sub(a);
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize());
    const e = new Euler().setFromQuaternion(q);
    const middle = a.add(b).multiplyScalar(.5);
    this.add(geometry, mat, [middle.x, middle.y, middle.z], [radius, direction.length(), radius * endRadiusScale], [e.x, e.y, e.z]);
  }
  finish(name: string, castShadow = true) {
    const group = new Group(); group.name = name;
    for (const [mat, list] of this.parts) {
      const geometry = mergeGeometries(list, false);
      for (const part of list) part.dispose();
      if (!geometry) throw new Error(`Could not build ${name}`);
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, mat); mesh.castShadow = castShadow; mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}

export function triangleGeometry(points: number[]) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** A scalloped, gently rounded conifer bough, with modeled overhanging tips. */
export function pineBough(seed: number) {
  const random = seeded(seed);
  const positions: number[] = [];
  const n = 18;
  const bottom = Array.from({ length: n }, (_, i) => {
    const angle = i / n * TAU;
    const radius = .91 + random() * .15;
    return [Math.cos(angle) * radius, -.30 - random() * .20, Math.sin(angle) * radius];
  });
  const middle = bottom.map(([x, , z]) => [x * .57, .26, z * .57]);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    positions.push(...bottom[i], ...middle[i], ...bottom[j], ...middle[i], ...middle[j], ...bottom[j]);
    positions.push(...middle[i], 0, .87, 0, ...middle[j]);
    positions.push(0, -.34, 0, ...bottom[i], ...bottom[j]);
  }
  const geometry = triangleGeometry(positions);
  geometry.computeVertexNormals();
  return geometry;
}

export function vertexTint(geometry: BufferGeometry, colorAt: (x: number, y: number, z: number) => Color) {
  const p = geometry.getAttribute('position'); const colors: number[] = [];
  for (let i = 0; i < p.count; i++) { const color = colorAt(p.getX(i), p.getY(i), p.getZ(i)); colors.push(color.r, color.g, color.b); }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
}
