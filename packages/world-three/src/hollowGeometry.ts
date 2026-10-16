import { Box3, BufferGeometry, Float32BufferAttribute } from 'three';

type Vertex = number[];
/** Subtract room volumes from a derived static mesh. Polygon clipping preserves
 * the exterior and interpolates UVs/normals along every new cut edge. */
export function hollowGeometry(source: BufferGeometry, volumes: readonly Box3[]): BufferGeometry {
  const names = ['position', ...Object.keys(source.attributes).filter(name => name !== 'position')];
  let offset = 0;
  const fields = names.map(name => { const attribute = source.getAttribute(name), start = offset; offset += attribute.itemSize; return { name, attribute, start, size: attribute.itemSize, values: [] as number[] }; });
  const vertex = (index: number): Vertex => fields.flatMap(({ attribute, size }) => Array.from({ length: size }, (_, c) =>
    c === 0 ? attribute.getX(index) : c === 1 ? attribute.getY(index) : c === 2 ? attribute.getZ(index) : attribute.getW(index)));
  function subtract(polygon: Vertex[], box: Box3): Vertex[][] {
    const outside: Vertex[][] = [];
    let remaining = polygon;
    for (const [axis, boundary, greater] of [[0, box.min.x, 1], [0, box.max.x, 0], [1, box.min.y, 1], [1, box.max.y, 0], [2, box.min.z, 1], [2, box.max.z, 0]]) {
      const inside: Vertex[] = [], rejected: Vertex[] = [];
      for (let i = 0; i < remaining.length; i++) {
        const a = remaining[i], b = remaining[(i + 1) % remaining.length];
        const ai = greater ? a[axis] >= boundary : a[axis] <= boundary;
        const bi = greater ? b[axis] >= boundary : b[axis] <= boundary;
        (ai ? inside : rejected).push(a);
        if (ai !== bi) {
          const t = (boundary - a[axis]) / (b[axis] - a[axis]);
          const intersection = a.map((value, c) => value + (b[c] - value) * t);
          inside.push(intersection); rejected.push(intersection);
        }
      }
      if (rejected.length >= 3) outside.push(rejected);
      remaining = inside; if (remaining.length < 3) break;
    }
    return outside;
  }
  const result = new BufferGeometry(), count = source.index?.count ?? source.attributes.position.count;
  let vertices = 0;
  for (let i = 0; i < count; i += 3) {
    let polygons = [[vertex(source.index ? source.index.getX(i) : i), vertex(source.index ? source.index.getX(i + 1) : i + 1), vertex(source.index ? source.index.getX(i + 2) : i + 2)]];
    for (const volume of volumes) polygons = polygons.flatMap(polygon => subtract(polygon, volume));
    const start = vertices;
    for (const polygon of polygons) for (let n = 1; n < polygon.length - 1; n++) for (const point of [polygon[0], polygon[n], polygon[n + 1]]) {
      for (const field of fields) for (let c = 0; c < field.size; c++) field.values.push(point[field.start + c]);
      vertices++;
    }
    if (source.groups.length && vertices > start) {
      const group = source.groups.find(g => i >= g.start && i < g.start + g.count), material = group?.materialIndex ?? 0, last = result.groups.at(-1);
      if (last?.materialIndex === material) last.count += vertices - start;
      else result.addGroup(start, vertices - start, material);
    }
  }
  for (const field of fields) result.setAttribute(field.name, new Float32BufferAttribute(field.values, field.size));
  if (result.hasAttribute('normal')) result.normalizeNormals(); else result.computeVertexNormals();
  result.computeBoundingBox(); result.computeBoundingSphere(); return result;
}
