import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

describe('Unity environment gates', () => {
  it('reports an explicit missing Editor and returns failure instead of claiming native readiness', () => {
    const result = spawnSync('pwsh', ['-NoProfile', '-File', 'scripts/unity/check-environment.ps1', '-Editor', path.resolve('does-not-exist/Unity.exe'), '-Json'], { encoding: 'utf8', timeout: 15000 });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(3);
    const report = JSON.parse(result.stdout);
    expect(report.editorFound).toBe(false);
    expect(report.readyForUnityValidation).toBe(false);
    expect(report.nextAction).toContain('Unity Hub');
  });
  it('refuses an existing unrelated executable instead of treating it as Unity', () => {
    const result = spawnSync('pwsh', ['-NoProfile', '-File', 'scripts/unity/check-environment.ps1', '-Editor', process.execPath, '-Json'], { encoding: 'utf8', timeout: 15000 });
    expect(result.status).toBe(3);
    expect(JSON.parse(result.stdout).editorFound).toBe(false);
  });
});
