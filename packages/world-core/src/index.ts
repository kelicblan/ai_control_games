/**
 * 可复用的连续世界基础：只依赖JavaScript，不知道营地、人物、Three.js或React。
 * 坐标单位由游戏指定；本游戏采用米。数值上限是浮点安全防护，不是可玩地图边界。
 */
export interface WorldPoint { x: number; y: number }
export interface MapView { center: WorldPoint; span: number }
export interface Observer extends WorldPoint { radius: number }
export type Visibility = 'unknown' | 'explored' | 'visible';
export const CHUNK_SIZE = 128;
export const FOG_CELL_SIZE = 16;
export const MAX_COORDINATE = 2 ** 40;
const CELLS_PER_CHUNK = CHUNK_SIZE / FOG_CELL_SIZE;
const KEY_PATTERN = /^-?\d+:-?\d+$/;

export function validPoint(point: WorldPoint): boolean {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && Math.abs(point.x) <= MAX_COORDINATE && Math.abs(point.y) <= MAX_COORDINATE;
}
function assertPoint(point: WorldPoint): void {
  if (!validPoint(point)) throw new RangeError('世界坐标必须是有限的安全数值');
}
export function worldToChunk(point: WorldPoint): WorldPoint {
  assertPoint(point);
  // 必须向负无穷取整；trunc会把-0.1错误映射到原点地图块。
  return { x: Math.floor(point.x / CHUNK_SIZE), y: Math.floor(point.y / CHUNK_SIZE) };
}
export const chunkKey = (point: WorldPoint): string => `${point.x}:${point.y}`;
export function parseChunkKey(key: string): WorldPoint {
  if (!KEY_PATTERN.test(key)) throw new Error('无效的地图块键');
  const [x, y] = key.split(':').map(Number);
  assertPoint({x: x * CHUNK_SIZE, y: y * CHUNK_SIZE});
  return {x, y};
}

/** 基于坐标的散列，不使用全局随机序列，因此加载顺序不会改变地形。 */
export function coordinateRandom(x: number, y: number, seed: number): number {
  let value = Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(y | 0, 0x5f356495) ^ (seed | 0);
  // 高位也参与散列，避免远距离块坐标32位截断后完全重复。
  value ^= Math.imul(Math.floor(x / 4294967296), 0x45d9f3b) ^ Math.imul(Math.floor(y / 4294967296), 0x119de1f3);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
export function seededNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = coordinateRandom(ix, iy, seed), b = coordinateRandom(ix + 1, iy, seed);
  const c = coordinateRandom(ix, iy + 1, seed), d = coordinateRandom(ix + 1, iy + 1, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

export interface ExplorationOptions {
  seed: number; generatorVersion: number; center: WorldPoint; initialRadius: number;
}
export interface ExplorationSave extends ExplorationOptions {
  schemaVersion: 1;
  /** 每块64个探索位，编码为16位十六进制；不存整张无限地图。 */
  chunks: Record<string, string>;
}

export class ExplorationMap {
  readonly seed: number;
  readonly generatorVersion: number;
  readonly center: WorldPoint;
  readonly initialRadius: number;
  private readonly chunks = new Map<string, Uint8Array>();
  revision = 0;
  constructor(options: ExplorationOptions) {
    assertPoint(options.center);
    if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff)
      throw new RangeError('世界种子必须是无符号32位整数');
    if (!Number.isInteger(options.generatorVersion) || options.generatorVersion < 1)
      throw new RangeError('生成器版本无效');
    if (!Number.isFinite(options.initialRadius) || options.initialRadius < 0 || options.initialRadius > 1e6)
      throw new RangeError('初始探索半径无效');
    this.seed = options.seed; this.generatorVersion = options.generatorVersion;
    this.center = Object.freeze({...options.center}); this.initialRadius = options.initialRadius;
  }
  isExplored(point: WorldPoint): boolean {
    assertPoint(point);
    if (Math.hypot(point.x - this.center.x, point.y - this.center.y) <= this.initialRadius) return true;
    const cellX = Math.floor(point.x / FOG_CELL_SIZE), cellY = Math.floor(point.y / FOG_CELL_SIZE);
    const chunkX = Math.floor(cellX / CELLS_PER_CHUNK), chunkY = Math.floor(cellY / CELLS_PER_CHUNK);
    const bits = this.chunks.get(`${chunkX}:${chunkY}`);
    const index = (cellY - chunkY * CELLS_PER_CHUNK) * CELLS_PER_CHUNK + cellX - chunkX * CELLS_PER_CHUNK;
    return !!bits && !!(bits[index >>> 3] & (1 << (index & 7)));
  }
  visibility(point: WorldPoint, observers: readonly Observer[]): Visibility {
    if (observers.some(observer => validPoint(observer) && Number.isFinite(observer.radius) && observer.radius >= 0
      && Math.hypot(point.x - observer.x, point.y - observer.y) <= observer.radius)) return 'visible';
    return this.isExplored(point) ? 'explored' : 'unknown';
  }
  /** 只能由权威模拟或明确的地图情报事件调用；相机和小地图不得调用。 */
  reveal(point: WorldPoint, radius: number): boolean {
    assertPoint(point);
    if (!Number.isFinite(radius) || radius < 0 || radius > 2048) throw new RangeError('单次探索半径超出预算');
    let changed = false;
    const minX = Math.floor((point.x - radius) / FOG_CELL_SIZE), maxX = Math.floor((point.x + radius) / FOG_CELL_SIZE);
    const minY = Math.floor((point.y - radius) / FOG_CELL_SIZE), maxY = Math.floor((point.y + radius) / FOG_CELL_SIZE);
    for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) {
      const px = (cx + .5) * FOG_CELL_SIZE, py = (cy + .5) * FOG_CELL_SIZE;
      // 记录角色所在格，其他格按中心点采样。边缘精度由16米探索格决定。
      const ownCell = cx === Math.floor(point.x / FOG_CELL_SIZE) && cy === Math.floor(point.y / FOG_CELL_SIZE);
      if (!ownCell && Math.hypot(px - point.x, py - point.y) > radius) continue;
      // 只有整格都属于初始已知圆才可省略，否则圆周附近会丢失新揭开的格角。
      if (Math.hypot(px - this.center.x, py - this.center.y) + FOG_CELL_SIZE * Math.SQRT1_2 <= this.initialRadius) continue;
      const chunkX = Math.floor(cx / CELLS_PER_CHUNK), chunkY = Math.floor(cy / CELLS_PER_CHUNK), key = `${chunkX}:${chunkY}`;
      let bits = this.chunks.get(key);
      if (!bits) { bits = new Uint8Array(8); this.chunks.set(key, bits); }
      const index = (cy - chunkY * CELLS_PER_CHUNK) * CELLS_PER_CHUNK + cx - chunkX * CELLS_PER_CHUNK;
      const mask = 1 << (index & 7), byte = index >>> 3;
      if (!(bits[byte] & mask)) { bits[byte] |= mask; changed = true; }
    }
    if (changed) this.revision++;
    return changed;
  }
  /** 同一世界的渲染投影应用权威存档；不是一次新的探索行为。 */
  synchronize(save: ExplorationSave): void {
    const restored = ExplorationMap.restore(save, [this.generatorVersion]);
    if (restored.seed !== this.seed || restored.initialRadius !== this.initialRadius
      || restored.center.x !== this.center.x || restored.center.y !== this.center.y)
      throw new Error('不能把另一世界的探索记录覆盖到当前世界');
    this.chunks.clear();
    for (const [key,bits] of restored.chunks) this.chunks.set(key,bits);
    this.revision++;
  }
  snapshot(): ExplorationSave {
    const chunks: Record<string, string> = {};
    for (const [key, bits] of this.chunks) chunks[key] = Array.from(bits, value => value.toString(16).padStart(2, '0')).join('');
    return {schemaVersion: 1, seed: this.seed, generatorVersion: this.generatorVersion,
      center: {...this.center}, initialRadius: this.initialRadius, chunks};
  }
  static restore(raw: unknown, supportedVersions: readonly number[] = [1]): ExplorationMap {
    if (!raw || typeof raw !== 'object') throw new Error('世界存档缺失');
    const save = raw as ExplorationSave;
    if (save.schemaVersion !== 1 || !supportedVersions.includes(save.generatorVersion))
      throw new Error('不支持此世界存档/生成器版本，不能重新生成覆盖旧世界');
    const map = new ExplorationMap(save);
    if (!save.chunks || typeof save.chunks !== 'object' || Array.isArray(save.chunks)) throw new Error('探索块数据损坏');
    const entries = Object.entries(save.chunks);
    if (entries.length > 100000) throw new Error('探索存档超过安全读取预算');
    for (const [key, hex] of entries) {
      parseChunkKey(key);
      if (typeof hex !== 'string' || !/^[\da-f]{16}$/i.test(hex)) throw new Error('探索位图损坏');
      map.chunks.set(key, Uint8Array.from({length:8}, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16)));
    }
    return map;
  }
}

/** 相机只管理绘制块；离屏NPC的模拟由游戏循环独立推进。 */
export class ChunkWindow<T> {
  private readonly loaded = new Map<string, T>();
  constructor(readonly budget: number, private readonly create: (key: string, chunk: WorldPoint) => T,
    private readonly release: (value: T) => void) {
    if (!Number.isInteger(budget) || budget < 1) throw new RangeError('地图块预算必须为正整数');
  }
  get size(): number { return this.loaded.size; }
  values(): IterableIterator<T> { return this.loaded.values(); }
  update(center: WorldPoint, radius: number): void {
    if (!Number.isInteger(radius) || radius < 0 || (radius * 2 + 1) ** 2 > this.budget)
      throw new RangeError('请求的地图窗口超过加载预算');
    const origin = worldToChunk(center), wanted = new Map<string, WorldPoint>();
    for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
      const chunk = {x: origin.x + x, y: origin.y + y}; wanted.set(chunkKey(chunk), chunk);
    }
    // 先卸载再创建，跨很远跳转时也不会瞬间占用双倍GPU资源。
    for (const [key, value] of this.loaded) if (!wanted.has(key)) { this.release(value); this.loaded.delete(key); }
    for (const [key, chunk] of wanted) if (!this.loaded.has(key)) this.loaded.set(key, this.create(key, chunk));
  }
  dispose(): void { for (const value of this.loaded.values()) this.release(value); this.loaded.clear(); }
}
function checkView(view: MapView): void {
  assertPoint(view.center);
  if (!Number.isFinite(view.span) || view.span <= 0) throw new RangeError('地图视野宽度必须为正数');
}
export function worldToMap(point: WorldPoint, view: MapView): WorldPoint {
  assertPoint(point); checkView(view);
  return {x: (point.x - view.center.x) / view.span + .5, y: (point.y - view.center.y) / view.span + .5};
}
export function mapToWorld(uv: WorldPoint, view: MapView): WorldPoint {
  assertPoint(uv); checkView(view);
  return {x: view.center.x + (uv.x - .5) * view.span, y: view.center.y + (uv.y - .5) * view.span};
}
