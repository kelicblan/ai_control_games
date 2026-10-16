import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindLordInput } from '../src/scene/lordInput';
import { defaultThirdPerson } from '../packages/world-three/src/thirdPerson';

class Surface extends EventTarget { closest() { return null; } }
let controls: ReturnType<typeof bindLordInput> | undefined;
afterEach(() => { controls?.dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup() {
  vi.useFakeTimers();
  const document = Object.assign(new EventTarget(), { hidden: false, activeElement: null as Surface | null });
  vi.stubGlobal('document', document); vi.stubGlobal('Element', Surface);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { setInterval, clearInterval }));
  const movements: { x: number; y: number }[] = [];
  controls = bindLordInput({ canvas: new Surface() as unknown as HTMLCanvasElement,
    enabled: () => true, view: defaultThirdPerson(), move: p => movements.push(p), changed() {} });
  const key = (type: string, code: string, value = 'Process') => document.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code, key: value, isComposing: true }));
  return { document, movements, key };
}

describe('physical lord movement keys', () => {
  it('moves with a Chinese IME Process key and stops on release of the physical W key', () => {
    const f = setup(); f.key('keydown', 'KeyW');
    expect(f.movements.length).toBe(1); expect(Math.hypot(f.movements[0].x, f.movements[0].y)).toBeCloseTo(1);
    vi.advanceTimersByTime(200); expect(f.movements.length).toBe(2);
    f.key('keyup', 'KeyW', 'Unidentified'); expect(f.movements.at(-1)).toEqual({ x: 0, y: 0 });
  });
  it('does not hijack physical movement keys while typing in a field', () => {
    const f = setup(), field = new Surface(); field.closest = () => field as never; f.document.activeElement = field;
    f.key('keydown', 'KeyD'); vi.advanceTimersByTime(400); expect(f.movements).toEqual([]);
  });
});
