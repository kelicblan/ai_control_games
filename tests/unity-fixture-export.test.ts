import { describe, expect, it } from 'vitest';
import { createGame } from '../src/games/camp/simulation/engine';
import { acceptAppraisal } from '../src/games/camp/npc/appraisal';
import { buildMigrationFixtures, canonicalJson, replayFixture, stateDigest } from '../scripts/export-unity-fixtures';

describe('Unity migration deterministic fixtures', () => {
  it('exports eight distinct real rule scenarios reproducibly without wall-clock policy latency', () => {
    const first = buildMigrationFixtures();
    expect(first).toHaveLength(8);
    expect(new Set(first.map(f => f.id)).size).toBe(8);
    expect(canonicalJson(buildMigrationFixtures())).toBe(canonicalJson(first));
    expect(first.flatMap(f => f.policyCalls).every(call => call.result.latencyMs === 0)).toBe(true);
    expect(first.some(f => f.policyCalls.length > 0)).toBe(true);
    for (const fixture of first) expect(replayFixture(fixture)).toEqual(fixture.checkpoints);
  }, 30000);

  it('captures actual commands, restore semantics, death continuation and stale appraisal rejection', () => {
    const fixtures = buildMigrationFixtures();
    const death = fixtures.find(f => f.id === 'npc-death-world-continues')!;
    expect(death.checkpoints.at(-1)!.state.status).toBe('playing');
    expect(death.checkpoints.at(-1)!.state.npcs.find(n => n.id === 'linlan')!.alive).toBe(false);
    expect(death.checkpoints.at(-1)!.state.elapsed).toBeGreaterThan(death.initialState.elapsed);
    const restore = fixtures.find(f => f.id === 'restart-held-input')!;
    expect(restore.operations.some(op => op.kind === 'restore')).toBe(true);
    expect(restore.checkpoints.at(-1)!.state.lord!.input).toEqual({ x: 0, y: 0 });
    const stale = fixtures.find(f => f.id === 'expired-ai-result')!;
    expect(stale.appraisalChecks).toEqual([{ accepted: false, stateUnchanged: true }]);
    const staleOperation = stale.operations.find(op => op.kind === 'appraisal')!;
    if (staleOperation.kind === 'appraisal') expect(acceptAppraisal(structuredClone(stale.initialState),
      { ...staleOperation.ticket, at: stale.initialState.elapsed }, staleOperation.raw)).not.toBeNull();
    expect(fixtures.find(f => f.id === 'social-work')!.checkpoints.at(-1)!.state.social.threads.length).toBeGreaterThan(0);
  });

  it('hashes state semantically without mutating it and rejects nonfinite data', () => {
    const state = createGame({ seed: 17 });
    const before = JSON.stringify(state);
    expect(stateDigest(state)).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(state)).toBe(before);
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 } })).toBe('{"a":{"x":3,"y":2},"z":1}');
    expect(() => canonicalJson({ x: Infinity })).toThrow('finite');
    expect(() => canonicalJson({ x: NaN })).toThrow('finite');
  });

  it('detects tampered checkpoints, input and recorded policy outputs', () => {
    const fixture = buildMigrationFixtures()[0];
    const bad = structuredClone(fixture);
    bad.checkpoints.at(-1)!.state.food += 1;
    expect(() => replayFixture(bad)).toThrow('checkpoint');
    const policy = structuredClone(fixture);
    policy.policyCalls[0].result.action = policy.policyCalls[0].result.action === 'explore' ? 'camp' : 'explore';
    expect(() => replayFixture(policy)).toThrow('policy');
    const input = structuredClone(buildMigrationFixtures().find(f => f.id === 'storm-transition')!);
    const operation = input.operations.find(op => op.kind === 'command')!;
    if (operation.kind === 'command') operation.command.weather = 'clear';
    expect(() => replayFixture(input)).toThrow('checkpoint');
  });
});
