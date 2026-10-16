import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

describe('Unity environment gates', () => {
  it('normalizes the actual Windows Editor product version including its build revision', () => {
    const code = ". ./scripts/unity/environment.ps1; @{release=(Get-CampMindEditorVersion '6000.3.26f1');revision=(Get-CampMindEditorVersion '6000.3.26f1_de8167e7440c');invalid=(Get-CampMindEditorVersion '6000.3.26f1_untrusted')} | ConvertTo-Json";
    const result = spawnSync('pwsh', ['-NoProfile', '-Command', code], { encoding: 'utf8', timeout: 15000 });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ release: '6000.3.26f1', revision: '6000.3.26f1', invalid: null });
  });
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
