import { Matrix3, Mesh, Raycaster, Vector3 } from 'three';
import type { Intersection } from 'three';

/** Reads the two rendered cloth meshes. Their refreshed sphere/box bounds reject distant drops. */
export class RainSurfaces {
  private readonly ray = new Raycaster();
  private readonly hits: Intersection[] = [];
  private readonly origin = new Vector3();
  private readonly direction = new Vector3();
  private readonly normalMatrix = new Matrix3();
  private readonly edgePoint = new Vector3();
  private readonly eaveVertices: number[];

  constructor(private readonly roofs: Mesh[], private readonly awning: Mesh) {
    const uv = awning.geometry.getAttribute('uv');
    this.eaveVertices = Array.from({ length: uv.count }, (_, i) => i)
      .filter(i => uv.getY(i) < .0001).sort((a, b) => uv.getX(a) - uv.getX(b));
    this.refresh();
  }

  /** Call after the existing cloth deformation, before weather uses the same simulation time. */
  refresh() {
    for (const roof of this.roofs) {
      roof.updateWorldMatrix(true, false);
      roof.geometry.computeBoundingBox();
      roof.geometry.computeBoundingSphere();
    }
  }

  /** x/z are the falling ray's ground intercept; positive lean follows the shared wind. */
  intersect(x: number, z: number, leanX: number, leanZ: number, point: Vector3, normal?: Vector3): boolean {
    this.origin.set(x - leanX * 32, 32, z - leanZ * 32);
    this.direction.set(leanX, -1, leanZ).normalize();
    this.ray.set(this.origin, this.direction);
    this.hits.length = 0;
    this.ray.intersectObjects(this.roofs, false, this.hits);
    const hit = this.hits[0];
    if (!hit) return false;
    point.copy(hit.point);
    if (normal) {
      normal.copy(hit.face!.normal).applyMatrix3(this.normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize();
      if (normal.y < 0) normal.negate();
    }
    return true;
  }

  /** Interpolates the actual animated lower edge, including sideways motion and sag. */
  eave(fraction: number, point: Vector3) {
    const position = this.awning.geometry.getAttribute('position');
    const along = Math.max(0, Math.min(1, fraction)) * (this.eaveVertices.length - 1);
    const left = Math.floor(along), right = Math.min(this.eaveVertices.length - 1, left + 1);
    point.fromBufferAttribute(position, this.eaveVertices[left]);
    this.edgePoint.fromBufferAttribute(position, this.eaveVertices[right]);
    point.lerp(this.edgePoint, along - left).applyMatrix4(this.awning.matrixWorld);
  }
}
