import {describe,expect,it} from 'vitest';
import {buildRenderReplay} from '../scripts/export-unity-render-replay';
import {stateDigest} from '../scripts/export-unity-fixtures';

describe('native renderer ground-truth replay',()=>{
  it('records full source states at100ms without native rules or model requests',()=>{
    const replay=buildRenderReplay('storm',2);
    expect(replay).toEqual(buildRenderReplay('storm',2));expect(replay.frames).toHaveLength(21);
    expect(replay.frames[0].state.elapsed).toBe(0);expect(replay.frames.at(-1)!.state.elapsed).toBeCloseTo(2,8);
    expect(replay.frames.at(-1)!.state.weather).toBe('storm');
    for(const frame of replay.frames){expect(frame.state.npcs).toHaveLength(9);expect(frame.state.world!.ecology!.animals).toHaveLength(43);expect(frame.state.world!.ecology!.resources).toHaveLength(84);expect(frame.sha256).toBe(stateDigest(frame.state));}
    expect(replay.policy).toBe('teacher-v3-zero-latency');
  });
  it('bounds capture duration instead of generating an unbounded fixture',()=>{
    expect(()=>buildRenderReplay('clear',0)).toThrow();expect(()=>buildRenderReplay('clear',121)).toThrow();
  });
});
