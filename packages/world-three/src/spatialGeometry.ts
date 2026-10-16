import { Box3, BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/** Exact render partitions: shared vertex attributes, original triangle indices,
 * separate tight bounds. No simplification, seams, or change to collision height. */
export function partitionGeometry(source: BufferGeometry, cellSize: number): BufferGeometry[] {
  const position = source.getAttribute('position'), index = source.index;
  const cells = new Map<string, { indices: number[]; bounds: Box3 }>();
  const point = new Vector3(), count = index?.count ?? position.count;
  for (let i = 0; i < count; i += 3) {
    const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
    const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
    const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
    const key = `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
    let cell = cells.get(key);
    if (!cell) { cell = { indices: [], bounds: new Box3() }; cells.set(key, cell); }
    cell.indices.push(a, b, c);
    for (const vertex of [a, b, c]) cell.bounds.expandByPoint(point.fromBufferAttribute(position, vertex));
  }
  return Array.from(cells.values(), cell => {
    const geometry = new BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
    geometry.setIndex(new BufferAttribute(new Uint32Array(cell.indices), 1));
    geometry.boundingBox = cell.bounds;
    geometry.boundingSphere = cell.bounds.getBoundingSphere(new Sphere());
    return geometry;
  });
}
