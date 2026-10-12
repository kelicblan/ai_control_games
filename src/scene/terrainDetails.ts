import { InstancedMesh, Object3D, PlaneGeometry, ShaderMaterial, SphereGeometry } from 'three';
import { TERRAIN } from '../game/terrain';

/** Rounded, weathered silhouettes remain inside the existing collision radius. */
export function createWeatheredStone(seed: number, detailed = true) {
  const geometry = new SphereGeometry(1, detailed ? 16 : 8, detailed ? 11 : 5);
  const positions = geometry.getAttribute('position');
  const phase = seed * .79;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const broad = Math.sin(x * 3.1 + phase) * Math.cos(z * 3.7 - phase * .31);
    const ridge = Math.sin(y * 7.2 + x * 2.3 + phase) * Math.cos(z * 4.1 + phase * .43);
    const radius = .82 + broad * .11 + ridge * .065;
    // Broader worn lobes and a settled base avoid a uniformly round pebble silhouette.
    positions.setXYZ(i, x * radius, Math.max(-.70, y * radius), z * radius);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A single small draw supplies soft contact occlusion underneath registered solid objects. */
export function createContactShadows() {
  const objects = TERRAIN.filter(object => ['tree', 'rock', 'tent', 'storage'].includes(object.kind));
  const geometry = new PlaneGeometry(1, 1);
  const material = new ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv;
      void main() {
        vec2 p = (vUv - .5) * 2.0;
        float radius = dot(p, p);
        float alpha = exp(-radius * 4.6) * (1.0 - smoothstep(.65, 1.0, radius)) * .24;
        if (alpha < .003) discard;
        gl_FragColor = vec4(.018, .025, .015, alpha);
        #include <colorspace_fragment>
      }`,
  });
  const shadows = new InstancedMesh(geometry, material, objects.length);
  shadows.name = 'Soft contact beneath camp objects';
  const pose = new Object3D();
  objects.forEach((object, index) => {
    const { shape } = object;
    const rx = shape.type === 'circle' ? shape.radius * 1.5 : shape.half.x * 1.2;
    const rz = shape.type === 'circle' ? shape.radius * 1.5 : shape.half.y * 1.2;
    pose.position.set(shape.center.x - 50, .018, shape.center.y - 50);
    pose.rotation.set(-Math.PI / 2, 0, 0); pose.scale.set(rx * 2, rz * 2, 1);
    pose.updateMatrix(); shadows.setMatrixAt(index, pose.matrix);
  });
  shadows.computeBoundingSphere();
  return shadows;
}
