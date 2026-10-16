import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

describe('Unity environment gates', () => {
  it('tracks lowercase Hub restart arguments for only the exact interactive project', () => {
    const code = `. ./scripts/unity/environment.ps1; $editor='D:/Unity/Unity.exe'; $project='D:/Games/Camp'; $cases=@(
      @{ExecutablePath=$editor;CommandLine='Unity.exe -projectpath "D:/Games/Camp" -useHub'},
      @{ExecutablePath=$editor;CommandLine='Unity.exe -projectPath "D:/Games/Camp2"'},
      @{ExecutablePath=$editor;CommandLine='Unity.exe -projectPath "D:/Games/Camp" -batchmode -name AssetImportWorker0'},
      @{ExecutablePath='C:/Other/Unity.exe';CommandLine='Unity.exe -projectPath "D:/Games/Camp"'}
    ); @($cases|ForEach-Object {Test-CampMindInteractiveEditor -Process $_ -EditorPath $editor -ProjectPath $project})|ConvertTo-Json -Compress`;
    const result=spawnSync('pwsh',['-NoProfile','-Command',code],{encoding:'utf8',timeout:15000});
    expect(result.status).toBe(0);expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual([true,false,false,false]);
  });
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
