import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { VillageRuntime } from '../../scripts/world/village-runtime';
import { proposalTermsHash } from '../../packages/social-core/src/contracts';
it('runs the trained NPC policy through the real persisted world and restores its item', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'p2-runtime-')), file = path.join(dir, 'world.sqlite'); let runtime = new VillageRuntime(file);
  try {
    runtime.create('owner', { id: 'p2-live', classification: 'experiment', ruleVersion: 'p2-life-alpha-v1', worldId: 'p2-live', seed: 17,
      inventory: { wood: 14, stone: 4, rope: 5, food: 10 }, actors: [{ archetypeId: 'H002', instanceId: 'worker' }] });
    runtime.setPaused('owner', 0, false);
    for (let i = 0; i < 800 && !Object.keys(runtime.read('owner')!.economy!.items).length; i++) runtime.tick();
    const before = runtime.read('owner')!; expect(Object.values(before.economy!.items).some(i => i.recipeId === 'WPN005')).toBe(true); expect(before.inventory.wood).toBe(0);expect(before.models.life.modelId).toBe('life-alpha-p2-playable-v1');expect(before.policyErrors).toEqual({});
    runtime.close(); runtime = new VillageRuntime(file); expect(runtime.read('owner')!.economy!.items).toEqual(before.economy!.items);
  } finally { runtime.close(); if (!path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Unsafe test cleanup path'); rmSync(dir, { recursive: true, force: true }); }
}, 60000);
it('does not discard unchanged equipment terms merely because a normal MLP task advanced', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'p2-social-')), runtime = new VillageRuntime(path.join(dir, 'world.sqlite'));
  let release!: () => void, requested = false;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  runtime.setSocialProvider(() => async (_prompt, schema) => {
    const properties = schema.properties as { choice?: { enum: string[] }; response?: unknown };
    if (properties.choice) { requested = true; await barrier; return JSON.stringify({ choice: properties.choice.enum.find(v => v.startsWith('give-')) ?? 'none' }); }
    return JSON.stringify({ response: 'accept' });
  });
  try {
    runtime.create('owner', { id: 'social-runtime', classification: 'experiment', ruleVersion: 'p2-life-alpha-v1', worldId: 'social-runtime', seed: 17, inventory: { wood: 14, stone: 4, rope: 5, food: 10 }, actors: [{ archetypeId: 'H002', instanceId: 'worker' }] });
    runtime.setPaused('owner', 0, false); for (let i = 0; i < 800; i++) runtime.tick(); expect(requested).toBe(true);
    release(); await new Promise(resolve => setTimeout(resolve, 50));
    const snapshot = runtime.read('owner')!; expect(Object.values(snapshot.social.issues).some(i => i.waitingForPlayer)).toBe(true);
    expect(Object.keys(snapshot.social.proposals)).toHaveLength(1);
    const proposal = Object.values(snapshot.social.proposals)[0];
    expect(runtime.consent('owner', snapshot.revision, { operationId: 'human-accept', proposalId: proposal.id, proposalVersion: proposal.version, termsHash: proposalTermsHash(proposal), response: 'accept' }).accepted).toBe(true);
    for (let i = 0; i < 100; i++) runtime.tick();
    const fulfilled = runtime.read('owner')!;
    expect(Object.values(fulfilled.social.agreements).some(a => a.status === 'fulfilled')).toBe(true);
    expect(Object.values(fulfilled.economy!.items).some(item => item.ownerId === 'player')).toBe(true);
  } finally { release(); runtime.close(); if (!path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Unsafe test cleanup path'); rmSync(dir, { recursive: true, force: true }); }
}, 60000);
