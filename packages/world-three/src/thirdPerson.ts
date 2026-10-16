import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { WorldPoint } from '../../world-core/src';

export interface ThirdPersonView { azimuth: number; elevation: number; distance: number }
export const LORD_CAMERA_MIN_DISTANCE=10;
export const LORD_CAMERA_MAX_DISTANCE=160;
export function defaultThirdPerson(): ThirdPersonView { return { azimuth: .46, elevation: .28, distance: 24 }; }
export function lordMoveDirection(right: number, forward: number, azimuth: number): WorldPoint {
  const length = Math.max(1, Math.hypot(right, forward));
  return { x: (right * Math.cos(azimuth) - forward * Math.sin(azimuth)) / length,
    y: (-right * Math.sin(azimuth) - forward * Math.cos(azimuth)) / length };
}
const target = new Vector3(), offset = new Vector3();
export function configureThirdPerson(camera: PerspectiveCamera, width: number, height: number,
  player: WorldPoint, ground: number, view: ThirdPersonView, origin: Vector3,
  heightAt: (point: WorldPoint) => number = () => ground,
  obstruction?: (from: Vector3, to: Vector3) => number): void {
  target.set(player.x - 50 - origin.x, ground + 4.5, player.y - 50 - origin.z);
  const distance = MathUtils.clamp(view.distance, LORD_CAMERA_MIN_DISTANCE, LORD_CAMERA_MAX_DISTANCE), elevation = MathUtils.clamp(view.elevation, .08, .85);
  offset.set(Math.sin(view.azimuth) * Math.cos(elevation) * distance + Math.cos(view.azimuth) * 2,
    Math.sin(elevation) * distance, Math.cos(view.azimuth) * Math.cos(elevation) * distance - Math.sin(view.azimuth) * 2);
  camera.position.copy(target).add(offset);
  if (obstruction) {
    const clearance = obstruction(target, camera.position);
    if (Number.isFinite(clearance) && clearance < offset.length()) camera.position.copy(target).addScaledVector(offset.normalize(), Math.max(2, clearance - 1));
  }
  const point = { x: camera.position.x + origin.x + 50, y: camera.position.z + origin.z + 50 };
  camera.position.y = Math.max(camera.position.y, heightAt(point) + 2);
  camera.aspect = Math.max(1, width) / Math.max(1, height); camera.fov = 58; camera.near = .2; camera.far = 2400;
  camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
}
