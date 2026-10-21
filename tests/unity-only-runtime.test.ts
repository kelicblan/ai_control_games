import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

describe('Unity is the only game client', () => {
  it('has no Web game entry or browser build commands', () => {
    for (const file of ['index.html', 'vite.config.ts', 'src/main.tsx', 'src/App.tsx', 'src/scene/campScene.ts', 'scripts/local-game.ts']) {
      expect(existsSync(file), file).toBe(false);
    }
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.scripts.start).toContain('scripts/unity/play.ps1');
    expect(pkg.scripts.build).toContain('scripts/unity/build-game.ps1');
    expect(pkg.scripts).not.toHaveProperty('test:e2e');
    for (const name of ['react', 'react-dom', 'lucide-react', 'three', 'three-mesh-bvh', '@wllama/wllama', '@wllama/wllama-compat']) {
      expect(pkg.dependencies ?? {}, name).not.toHaveProperty(name);
    }
  });

  it('keeps browser and rendering libraries out of the authoritative service import graph', () => {
    const visited = new Set<string>();
    function inspect(file: string) {
      file = path.resolve(file);
      if (visited.has(file)) return;
      visited.add(file);
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/import\.meta\.env/);
      for (const ref of ts.preProcessFile(source, true, true).importedFiles) {
        expect(ref.fileName, file).not.toMatch(/^(three|react|react-dom|@wllama|vite)(\/|$)/);
        if (!ref.fileName.startsWith('.')) continue;
        const base = path.resolve(path.dirname(file), ref.fileName);
        const target = [base, `${base}.ts`, `${base}/index.ts`].find(f => existsSync(f) && /\.(ts|json)$/.test(f));
        expect(target, `${file} -> ${ref.fileName}`).toBeDefined();
        if (target?.endsWith('.ts')) inspect(target);
      }
    }
    inspect('scripts/world/server.ts');
    expect(visited.size).toBeGreaterThan(50);
  });
});
