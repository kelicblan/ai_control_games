import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { configureThirdPerson, defaultThirdPerson, lordMoveDirection,LORD_CAMERA_MAX_DISTANCE } from '../packages/world-three/src/thirdPerson';

describe('lord camera', () => {
  it('can show a much wider view than the old 48 metre limit',()=>{
    const camera=new PerspectiveCamera(),view={...defaultThirdPerson(),distance:LORD_CAMERA_MAX_DISTANCE};
    configureThirdPerson(camera,2879,1505,{x:50,y:50},0,view,new Vector3());
    expect(Math.hypot(camera.position.x,camera.position.z)).toBeGreaterThan(140);
  });
  it('uses a perspective shoulder view facing the player and accounts for world origin', () => {
    const camera = new PerspectiveCamera(), view = defaultThirdPerson();
    configureThirdPerson(camera, 1440, 900, { x: 1074, y: 2098 }, 3, view, new Vector3(1024, 0, 2048));
    expect(camera.aspect).toBe(1.6);
    expect(camera.position.y).toBeGreaterThan(7);
    const projected = new Vector3(0, 7.5, 0).project(camera);
    expect(Math.abs(projected.x)).toBeLessThan(.5);
    expect(Math.abs(projected.y)).toBeLessThan(.5);
  });
  it('normalizes diagonal movement and maps forward to camera heading', () => {
    const forward = lordMoveDirection(0, 1, 0);
    expect(forward).toEqual({ x: 0, y: -1 });
    const diagonal = lordMoveDirection(1, 1, Math.PI / 2);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
    expect(diagonal.x).toBeLessThan(0);
    expect(diagonal.y).toBeLessThan(0);
  });
  it('keeps camera above sampled terrain and respects obstacle distance', () => {
    const camera = new PerspectiveCamera(), view = defaultThirdPerson();
    configureThirdPerson(camera, 1000, 800, { x: 50, y: 50 }, 0, view, new Vector3(), () => 18, () => 8);
    expect(camera.position.y).toBeGreaterThanOrEqual(20);
    expect(Math.hypot(camera.position.x, camera.position.z)).toBeLessThan(view.distance);
  });
});
