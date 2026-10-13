import { describe, it, expect } from 'vitest';
import { worldToChunk, seededNoise, ExplorationMap, ChunkWindow, worldToMap, mapToWorld } from '../packages/world-core/src';
import { sampleCampSurface, riverCenter, CAMP_HOUSES } from '../src/games/camp/world/definition';
const make = () => new ExplorationMap({ seed:17, generatorVersion:1, center:{x:50,y:55}, initialRadius:1000 });
describe('可扩展世界公共核心', () => {
  it('支持负坐标且拒绝非有限输入', () => {
    expect(worldToChunk({x:-.1,y:-128})).toEqual({x:-1,y:-1});
    expect(worldToChunk({x:128,y:0})).toEqual({x:1,y:0});
    expect(() => worldToChunk({x:NaN,y:0})).toThrow();
  });
  it('种子地形不受查询或加载顺序影响', () => {
    const a=seededNoise(-3.2,9.4,17);seededNoise(900,200,999);
    expect(seededNoise(-3.2,9.4,17)).toBe(a);
    expect(seededNoise(-3.2,9.4,18)).not.toBe(a);
    expect(Math.abs(seededNoise(-3.2+1e-6,9.4,17)-a)).toBeLessThan(1e-4);
  });
  it('只初始化半径1000米，查询绝不揭雾', () => {
    const map=make(),before=map.snapshot();
    expect(map.isExplored({x:1050,y:55})).toBe(true);
    expect(map.isExplored({x:1050.01,y:55})).toBe(false);
    expect(map.visibility({x:-2000,y:-2000},[])).toBe('unknown');
    expect(map.snapshot()).toEqual(before);
  });
  it('实际探索可存取，离开后保留已探索状态', () => {
    const map=make(),p={x:-2000,y:-2000};
    expect(map.reveal(p,80)).toBe(true);expect(map.reveal(p,80)).toBe(false);
    expect(map.visibility(p,[{...p,radius:80}])).toBe('visible');
    expect(ExplorationMap.restore(map.snapshot()).visibility(p,[])).toBe('explored');
    expect(() => ExplorationMap.restore({...map.snapshot(),generatorVersion:99})).toThrow();
    expect(() => ExplorationMap.restore({...map.snapshot(),chunks:{'0:0':'XX'}})).toThrow();
  });
  it('跨很远跳转也不超过地图块预算，并正确释放', () => {
    const live=new Set<string>();
    const cache=new ChunkWindow(25,key=>{live.add(key);return key;},key=>{live.delete(key);});
    cache.update({x:0,y:0},2);expect(live.size).toBe(25);
    cache.update({x:-12800,y:12800},2);expect(live.size).toBe(25);
    expect(()=>cache.update({x:0,y:0},20)).toThrow();cache.dispose();expect(live.size).toBe(0);
  });
  it('小地图坐标转换可逆',()=>{
    const v={center:{x:-2150,y:3070},span:1024},p={x:-2111,y:3121};
    expect(mapToWorld(worldToMap(p,v),v)).toEqual(p);
  });
  it('17个地图块接缝与河道边界连续，北侧有真实山高',()=>{
    for(let x=-1024;x<=1024;x+=128)expect(Math.abs(sampleCampSurface({x:x-1e-6,y:-670},17).height-sampleCampSurface({x:x+1e-6,y:-670},17).height)).toBeLessThan(.001);
    for(const y of [-111,-110,-109,209,210,211,512,1024])expect(Math.abs(riverCenter(y+1e-6)-riverCenter(y-1e-6))).toBeLessThan(.001);
    expect(sampleCampSurface({x:0,y:-700},17).height).toBeGreaterThan(50);
  });
  it('初始营地为两间房且伙伴具有五个独立床位',()=>{
    expect(CAMP_HOUSES).toHaveLength(2);expect(CAMP_HOUSES[1].beds).toHaveLength(5);
    expect(CAMP_HOUSES.every(h=>h.doorWidth>=3)).toBe(true);
  });
});
