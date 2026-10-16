import { Box3, Matrix3, Matrix4, Mesh, Raycaster, Vector3 } from 'three';
import type { BufferGeometry, Intersection } from 'three';

/** Reads the two rendered cloth meshes. Their refreshed sphere/box bounds reject distant drops. */
export class RainSurfaces {
  private readonly ray = Object.assign(new Raycaster(), { firstHitOnly: true });
  private readonly hits: Intersection[] = [];
  private readonly origin = new Vector3();
  private readonly direction = new Vector3();
  private readonly normalMatrix = new Matrix3();
  private readonly edgePoint = new Vector3();
  private readonly eaveVertices: number[];
  private ceiling=32;
  private readonly roofBounds=new Box3();
  private staticScene = false;
  private staticRoofs: { mesh: Mesh; geometry: BufferGeometry; matrix: Matrix4 }[] = [];
  private readonly contacts = new Map<string, { point: Vector3; normal: Vector3 } | null>();
  private readonly contactNormal = new Vector3();

  constructor(private readonly roofs: Mesh[], private readonly awning: Mesh | null) {
    if(!awning){this.eaveVertices=[];this.refresh();return;}
    const uv = awning.geometry.getAttribute('uv');
    this.eaveVertices = Array.from({ length: uv.count }, (_, i) => i)
      .filter(i => uv.getY(i) < .0001).sort((a, b) => uv.getX(a) - uv.getX(b));
    this.refresh();
  }

  /** Call after the existing cloth deformation, before weather uses the same simulation time. */
  refresh() {
    this.ceiling=32;
    let unchanged = this.staticScene && this.staticRoofs.length === this.roofs.length;
    let allStatic = true;
    for (const [index, roof] of this.roofs.entries()) {
      roof.updateWorldMatrix(true, false);
      const previous = this.staticRoofs[index];
      unchanged &&= previous?.mesh === roof && previous.geometry === roof.geometry && previous.matrix.equals(roof.matrixWorld);
      this.ceiling=Math.max(this.ceiling,this.roofBounds.setFromObject(roof).max.y+2);
      if(roof.userData.staticRainSurface)continue;
      allStatic = false;
      roof.geometry.computeBoundingBox();
      roof.geometry.computeBoundingSphere();
    }
    if (!unchanged || !allStatic) {
      this.contacts.clear();
      this.staticRoofs = allStatic ? this.roofs.map(mesh => ({ mesh, geometry: mesh.geometry, matrix: mesh.matrixWorld.clone() })) : [];
    }
    this.staticScene = allStatic;
  }

  /** x/z are the falling ray's ground intercept; positive lean follows the shared wind. */
  intersect(x: number, z: number, leanX: number, leanZ: number, point: Vector3, normal?: Vector3): boolean {
    // The source models are immutable. Identical rays remain exact until a roof
    // or its world transform changes; animated cloth is deliberately never cached.
    const key = this.staticScene ? `${x},${z},${leanX},${leanZ}` : '';
    const cached = this.staticScene ? this.contacts.get(key) : undefined;
    if (cached !== undefined) {
      if (!cached) return false;
      point.copy(cached.point); normal?.copy(cached.normal); return true;
    }
    this.origin.set(x - leanX * this.ceiling, this.ceiling, z - leanZ * this.ceiling);
    this.direction.set(leanX, -1, leanZ).normalize();
    this.ray.set(this.origin, this.direction);
    this.hits.length = 0;
    this.ray.intersectObjects(this.roofs, false, this.hits);
    const hit = this.hits[0];
    if (this.staticScene && this.contacts.size >= 2048) this.contacts.clear();
    if (!hit) { if (this.staticScene) this.contacts.set(key, null); return false; }
    point.copy(hit.point);
    if (normal || this.staticScene) {
      this.contactNormal.copy(hit.face!.normal).applyMatrix3(this.normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize();
      if (this.contactNormal.y < 0) this.contactNormal.negate();
      normal?.copy(this.contactNormal);
    }
    if (this.staticScene) this.contacts.set(key, { point: point.clone(), normal: this.contactNormal.clone() });
    return true;
  }

  /** Interpolates the actual animated lower edge, including sideways motion and sag. */
  eave(fraction: number, point: Vector3) {
    if(!this.awning){point.set(0,0,0);return;}
    const position = this.awning.geometry.getAttribute('position');
    const along = Math.max(0, Math.min(1, fraction)) * (this.eaveVertices.length - 1);
    const left = Math.floor(along), right = Math.min(this.eaveVertices.length - 1, left + 1);
    point.fromBufferAttribute(position, this.eaveVertices[left]);
    this.edgePoint.fromBufferAttribute(position, this.eaveVertices[right]);
    point.lerp(this.edgePoint, along - left).applyMatrix4(this.awning.matrixWorld);
  }
}
