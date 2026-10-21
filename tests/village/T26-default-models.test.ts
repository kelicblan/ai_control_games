import { test, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { VillageRuntime } from '../../scripts/world/village-runtime';

test('new paused P4 campaign reports both genuine models before any simulation tick and after reload', () => {
  const database = path.join(mkdtempSync(path.join(tmpdir(), 'village-default-models-')), 'world.sqlite');
  const release = JSON.parse(readFileSync(path.join(process.env.CAMP_VILLAGE_MODEL_DIR ?? 'public/models/village-v4', 'release.json'), 'utf8'));
  let runtime = new VillageRuntime(database);
  try {
    const created = runtime.createCampaign('owner', 1701);
    expect(created.paused).toBe(true);
    for (const head of ['life', 'tactical']) expect(created.models[head]?.modelHash).toBe(release.models[head]);
    expect(Object.keys(created.executions)).toHaveLength(0);
    runtime.close(); runtime = new VillageRuntime(database);
    const restored = runtime.read('owner')!;
    expect(restored.worldId).toBe(created.worldId);
    expect(restored.elapsed).toBe(created.elapsed);
    for (const head of ['life', 'tactical']) expect(restored.models[head]?.modelHash).toBe(release.models[head]);
  } finally { runtime.close(); }
}, 60000);
