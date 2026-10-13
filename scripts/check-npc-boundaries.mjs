/**
 * 通用包的依赖边界检查。
 * 独立 tsc 能发现 DOM 类型泄漏；此检查进一步阻止纯包反向导入 src、Node 模块
 * 或额外 SDK，避免代码移了目录却仍只能在当前游戏里运行。
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const roots = ['npc-core', 'npc-dialogue'].map(name => path.join(root, 'packages', name));
async function sources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory()
    ? sources(path.join(directory, entry.name))
    : entry.name.endsWith('.ts') ? [path.join(directory, entry.name)] : []));
  return nested.flat();
}
const violations = [];
let count = 0;
for (const packageRoot of roots) {
  for (const file of await sources(path.join(packageRoot, 'src'))) {
    count++;
    const source = await readFile(file, 'utf8');
    for (const imported of ts.preProcessFile(source, true, true).importedFiles) {
      const reference = imported.fileName;
      const target = path.resolve(path.dirname(file), reference);
      // 当前两个包都是零依赖源码包；以后确需依赖时，应在此显式评审白名单。
      if (!reference.startsWith('.') || !target.startsWith(`${packageRoot}${path.sep}`)) {
        violations.push(`${path.relative(root, file)} 导入了包外依赖 ${reference}`);
      }
    }
  }
}
if (violations.length) {
  process.stderr.write(`${violations.join('\n')}\n`);
  process.exitCode = 1;
} else process.stdout.write(`NPC 包依赖边界通过：${count} 个源码文件，无宿主/浏览器/第三方依赖。\n`);
