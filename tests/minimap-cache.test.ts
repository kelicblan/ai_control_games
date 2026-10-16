import { describe, expect, it } from 'vitest';
import { ExplorationMap, ChunkWindow } from '../packages/world-core/src';
import { MiniMapRaster } from '../packages/world-ui/src/minimapRaster';
import { FrameProfile } from '../src/scene/frameProfile';

describe('bounded presentation work', () => {
  it('reuses world pixels on pan, bounds new sampling, and never reveals unknown terrain', () => {
    const exploration = new ExplorationMap({ seed: 1, generatorVersion: 1, center: { x: 0, y: 0 }, initialRadius: 1000 });
    let samples = 0;
    const raster = new MiniMapRaster(exploration, () => { samples++; return [120, 130, 140]; });
    const view = { center: { x: 0, y: 0 }, span: 128 };
    let result = raster.render(view, 100, Infinity);
    expect(samples).toBe(100); expect(result.pending).toBe(true);
    result = raster.render(view, Infinity, Infinity);
    expect(result.pending).toBe(false);
    const warmed = samples;
    raster.render(view, Infinity, Infinity); expect(samples).toBe(warmed);
    raster.render({ ...view, center: { x: 1, y: 0 } }, Infinity, Infinity);
    expect(samples-warmed).toBe(130);
    const remote = { center: { x: 5000, y: 5000 }, span: 128 };
    const before = samples;
    result = raster.render(remote, Infinity, Infinity);
    expect(samples).toBe(before); expect(result.pixels.slice(0,4)).toEqual(new Uint8ClampedArray([4,7,9,255]));
    exploration.reveal(remote.center, 16);
    raster.render(remote, Infinity, Infinity); expect(samples).toBeGreaterThan(before);
    exploration.synchronize({ ...exploration.snapshot(), chunks: {} });
    result = raster.render(remote, Infinity, Infinity);
    expect([...result.pixels].filter((_,i)=>i%4===0).every(v=>v===4)).toBe(true);
  });
  it('limits chunk builds and cancels obsolete pending work after teleport', () => {
    const created:string[] = [], released:string[] = [];
    const window = new ChunkWindow(25, key => { created.push(key); return key; }, key=>released.push(key));
    window.update({ x: 0, y: 0 }, 2, 2);
    expect(created).toHaveLength(2); expect(created[0]).toBe('0:0');
    window.update({ x: 12800, y: 12800 }, 2, 2);
    expect(created.slice(2)).toHaveLength(2); expect(created[2]).toBe('100:100');
    expect(released).toHaveLength(2);
    for(let i=0;i<20;i++) window.update({x:12800,y:12800},2,2);
    expect(window.size).toBe(25); expect(created).toHaveLength(27);
    window.dispose(); expect(released).toHaveLength(27);
  });
  it('reports bounded frame percentiles and CPU stages without counting hidden gaps', () => {
    const profile = new FrameProfile(true, 4);
    profile.begin(0); profile.begin(10); profile.begin(30); profile.begin(90); profile.begin(120);
    profile.record('weather', 2); profile.record('weather', 4);
    let report = profile.snapshot();
    expect(report.frames.p50).toBe(20); expect(report.frames.p95).toBe(60);
    expect(report.frames.over50).toBe(1); expect(report.cpu.weather.mean).toBe(3);
    profile.resetInterval(); profile.begin(10000); profile.begin(10010);
    report=profile.snapshot(); expect(report.frames.p95).toBe(60);
    const disabled=new FrameProfile(false); disabled.begin(0); disabled.begin(100); disabled.record('weather',20);
    expect(disabled.snapshot().frames.count).toBe(0);
  });
});
