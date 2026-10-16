import type { Mesh } from 'three';
import { acceleratedRaycast, disposeBoundsTree, MeshBVH } from 'three-mesh-bvh';

/** Per-mesh acceleration for immutable model geometry; animated cloth stays on Three's raycaster. */
export function accelerateStaticMesh(mesh: Mesh): void {
  const geometry = mesh.geometry;
  if ((geometry.index?.count ?? geometry.getAttribute('position').count) < 1536) return;
  if (!geometry.boundsTree) {
    // Indirect mode preserves the original index/face order and every source triangle.
    geometry.boundsTree = new MeshBVH(geometry, { indirect: true });
    const dispose = () => {
      disposeBoundsTree.call(geometry);
      geometry.removeEventListener('dispose', dispose);
    };
    geometry.addEventListener('dispose', dispose);
  }
  mesh.raycast = acceleratedRaycast;
}
