import { MathUtils, OrthographicCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { GROUND_BOUNDS } from '../game/terrain';
import type { Point } from '../game/types';

export interface CameraOrbit { azimuth: number; elevation: number; zoom: number; focus: Vector3 }
export interface ScreenPoint { x: number; y: number; depth: number; visible: boolean }
const ground = new Plane(new Vector3(0, 1, 0), 0);
const ray = new Raycaster();
const ndc = new Vector2();
const projected = new Vector3();
const hit = new Vector3();

export function defaultOrbit(): CameraOrbit {
  return { azimuth: .46, elevation: .78, zoom: 1, focus: new Vector3(0, 1.5, 4) };
}

/** The same camera is used for pixels, DOM labels and ground picking. */
export function configureCamera(camera: OrthographicCamera, width: number, height: number, orbit: CameraOrbit) {
  const aspect = Math.max(1, width) / Math.max(1, height);
  const halfWidth = aspect < .85 ? 36 : Math.max(36, 33 * aspect);
  const halfHeight = halfWidth / aspect;
  camera.left = -halfWidth; camera.right = halfWidth;
  camera.top = halfHeight; camera.bottom = -halfHeight;
  camera.near = .1; camera.far = 550;
  camera.zoom = MathUtils.clamp(orbit.zoom, .7, 2.2) * (aspect < .85 ? 1.55 : 1.08);
  const distance = 180;
  const horizontal = Math.cos(orbit.elevation) * distance;
  camera.position.set(
    orbit.focus.x + Math.sin(orbit.azimuth) * horizontal,
    orbit.focus.y + Math.sin(orbit.elevation) * distance,
    orbit.focus.z + Math.cos(orbit.azimuth) * horizontal,
  );
  camera.lookAt(orbit.focus);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

export function projectWorld(camera: OrthographicCamera, world: Vector3, width: number, height: number): ScreenPoint {
  projected.copy(world).project(camera);
  return {
    x: (projected.x * .5 + .5) * width,
    y: (-projected.y * .5 + .5) * height,
    depth: projected.z,
    visible: projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) <= 1.04 && Math.abs(projected.y) <= 1.04,
  };
}

export function groundFromScreen(camera: OrthographicCamera, x: number, y: number, width: number, height: number): Point | null {
  if (width <= 0 || height <= 0) return null;
  ndc.set(x / width * 2 - 1, -(y / height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectPlane(ground, hit)) return null;
  return {
    x: MathUtils.clamp(hit.x + 50, GROUND_BOUNDS.minX, GROUND_BOUNDS.maxX),
    y: MathUtils.clamp(hit.z + 50, GROUND_BOUNDS.minY, GROUND_BOUNDS.maxY),
  };
}
