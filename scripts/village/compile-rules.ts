import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeRawWorkbook, type DecisionRecord, type RuleSelection } from '../../src/games/camp/village/config/schema';
import { resolveRules, RuleCompilationError } from '../../src/games/camp/village/config/profiles';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const option = (name: string) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
const profile = option('--profile'), mode = option('--mode');
if (!['draft-table-v1','p2-life-alpha-v1','p3-defense-alpha-v1','p4-social-content-v1'].includes(profile??'') || !['draft', 'release'].includes(mode ?? '')) {
  throw new Error('Required: --profile draft-table-v1 --mode draft|release [--output <workspace directory>]');
}
const output = path.resolve(root, option('--output') ?? `docs/implementation/village/compiled/${profile}`);
if (!output.startsWith(root + path.sep)) throw new Error('Rule artifacts must stay inside the Unity workspace');
const config = path.join(root, 'src/games/camp/village/config');
const read = (name: string): unknown => JSON.parse(readFileSync(path.join(config, name), 'utf8'));
mkdirSync(output, { recursive: true });
try {
  const rules = resolveRules(decodeRawWorkbook(read(profile?.startsWith('p3-')||profile?.startsWith('p4-')?'raw-v2.json':'raw.json')), read('decisions.json') as DecisionRecord[], mode as 'draft' | 'release', read(profile + '.json') as RuleSelection);
  const report = { ok: true, worldMode: rules.worldMode, ruleVersion: rules.ruleVersion, ruleHash: rules.ruleHash,
    sourceWorkbookHash: rules.sourceWorkbookHash, classification: rules.classification, clock: rules.clock,
    pendingDecisions: rules.decisions.filter(d => d.status !== 'accepted').map(d => d.id),
    configuredCapabilities: Object.entries(rules.capabilities).filter(([, c]) => c.configured).map(([id]) => id),
    unavailableCapabilities: Object.fromEntries(Object.entries(rules.capabilities).filter(([, c]) => !c.configured).map(([id, c]) => [id, c.missing])),
    runtimeEnabled: false, diagnostics: rules.diagnostics };
  writeFileSync(path.join(output, 'compiled.json'), JSON.stringify(rules, null, 2) + '\n');
  writeFileSync(path.join(output, 'compilation-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} catch (error) {
  const report = { ok: false, mode, profile, diagnostics: error instanceof RuleCompilationError ? error.diagnostics
    : [{ code: 'invalid_input', message: error instanceof Error ? error.message : String(error) }] };
  writeFileSync(path.join(output, 'compilation-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.error(JSON.stringify(report)); process.exitCode = 2;
}
