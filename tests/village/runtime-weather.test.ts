import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { VillageRuntime } from '../../scripts/world/village-runtime';

it('persists village weather, freezes it while paused, and projects rain and shelter from the same state', () => {
  const dir=mkdtempSync(path.join(tmpdir(),'village-weather-')), file=path.join(dir,'world.sqlite');let runtime=new VillageRuntime(file);
  try {
    const initial=runtime.create('weather-owner',{id:'weather',classification:'experiment',ruleVersion:'p2-life-alpha-v1',worldId:'weather-world',seed:17,inventory:{wood:14,stone:4,rope:5,food:10},actors:[]});
    expect(initial.weather).toBe('clear');expect(initial.atmosphere.rainIntensity).toBe(0);
    const storm=runtime.setWeather('weather-owner',initial.revision,'storm',initial.worldId);
    expect(storm.weather).toBe('storm');expect(storm.presentation.weather.kind).toBe('storm');
    expect(()=>runtime.setWeather('weather-owner',initial.revision,'rain',initial.worldId)).toThrow();
    for(let i=0;i<20;i++)runtime.tick();expect(runtime.read('weather-owner')!.atmosphere).toEqual(storm.atmosphere);
    const running=runtime.setPaused('weather-owner',storm.revision,false,storm.worldId);
    for(let i=0;i<80;i++)runtime.tick();
    const rain=runtime.read('weather-owner')!;expect(rain.elapsed).toBeGreaterThan(running.elapsed);expect(rain.atmosphere.rainIntensity).toBeGreaterThan(.5);expect(rain.atmosphere.lightningAt).toBeGreaterThan(0);expect(rain.presentation.audio.ambient.rain.gain).toBeGreaterThan(0);
    expect(rain.presentation.weather.crew).toHaveLength(1);expect(rain.presentation.weather.crew[0].npcId).toBe('player');
    runtime.setPaused('weather-owner',rain.revision,true,rain.worldId);const before=runtime.read('weather-owner')!;
    runtime.close();runtime=new VillageRuntime(file);expect(runtime.read('weather-owner')!.atmosphere).toEqual(before.atmosphere);expect(runtime.read('weather-owner')!.weatherUntil).toBe(before.weatherUntil);expect(runtime.read('weather-owner')!.inventory).toEqual(before.inventory);
    expect(()=>runtime.setWeather('weather-owner',before.revision,'invalid' as never,before.worldId)).toThrow();
  } finally {runtime.close();if(!path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep))throw new Error('Unsafe test cleanup');rmSync(dir,{recursive:true,force:true});}
});
