import { readFileSync, writeFileSync, copyFileSync, mkdirSync, renameSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ensure } from '../../packages/action-runtime/src/json';
import { loadV4Bundle } from '../mlp_v4/load-bundle';
import { V4_SPEC } from '../../src/games/camp/village/ai/observation';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { lifeEngineHash } from '../mlp_v4/engine-hash';
import { loadAnimalModel } from '../../src/games/camp/animals/model';
import { publishVillagePackage } from '../unity/village-package.mjs';
const root = process.cwd(), artifacts = path.resolve(process.argv[2] ?? ''), nativeRun = path.resolve(process.argv[3] ?? ''), upgradeRun = path.resolve(process.argv[4] ?? ''), animalRun = path.resolve(process.argv[5] ?? '');
const json = (f: string) => JSON.parse(readFileSync(f, 'utf8')), sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');
ensure(artifacts.startsWith(path.join(root, 'native/Artifacts') + path.sep) && [nativeRun, upgradeRun, animalRun].every(f => f.startsWith(path.join(root, 'native/Artifacts/slice-'))), 'Only this workspace acceptance artifacts may be published');
const verification = json(`${artifacts}/verification.json`), tests = json(`${artifacts}/tests.json`), build = json('native/Artifacts/village/P6/build.json');
const native = json(`${nativeRun}/village-result.json`), upgraded = json(`${upgradeRun}/village-result.json`), upgrade = json(`${upgradeRun}/automatic-upgrade.json`);
const rules = selectWorldRules('village-v1', 'p4-social-content-v1'), bundle = loadV4Bundle(`${artifacts}/models`, rules.ruleHash, V4_SPEC);
ensure(verification.passed && verification.engineHash === lifeEngineHash(), 'Fresh real-model provenance, independent parity and physical workshop tests required');
ensure(tests.numFailedTests === 0 && tests.numPassedTests > 0 && tests.numFailedTestSuites === 0, 'Village regression gate failed');
ensure(build.success && build.errors === 0 && native.success && native.defaultMode && native.startupIncluded && native.workshopVerified && native.growthVerified && native.goalsVerified && native.originalHudRetained && native.keyboardMovementVerified && native.modelSettingsVerified, 'Formal startup, actual workshop/crafting/equipment, rendered growth/goals and original controls must pass');
for (const run of [nativeRun, upgradeRun]) {
  ensure(json(`${run}/processes.json`).executable === build.executable && json(`${run}/launcher-result.json`).success && json(`${run}/village-resume.json`).success, 'The current build must launch and survive a runtime restart');
  ensure(statSync(`${run}/player.log`).birthtimeMs >= Date.parse(build.builtUtc), 'Native evidence predates the build');
  ensure(!/NullReferenceException|InvalidOperationException|ArgumentNullException|failed to create (?:2D texture|buffer)/i.test(readFileSync(`${run}/player.log`, 'utf8')), 'Native player contains unresolved runtime errors');
}
ensure(upgraded.success && upgraded.automaticUpgrade && upgrade.success && upgrade.sourceArchiveVerified && upgrade.legacyFrozen && upgrade.inventoryVerified, 'Legacy source archive, inventory and automatic migration must pass');
for (const head of ['life', 'tactical'] as const) {
  const hash = bundle[head].manifest.sha256;
  ensure(native.models[head]?.modelHash === hash && upgraded.models[head]?.modelHash === hash && verification.models[head] === hash, 'All evidence must use the same optimized model');
}
const marker = 'native/Builds/village-current.json', previous = json(marker), backup = `${artifacts}/deployment-backup`; mkdirSync(backup, { recursive: true });
copyFileSync(marker, `${backup}/village-current.json`);
const animal = loadAnimalModel(); ensure(!previous.animalModelHash || previous.animalModelHash === animal.hash, 'This update must preserve animal weights');
const animalProof = json(`${animalRun}/animal-result.json`);
const resetProof = json(`${animalRun}/reset-result.json`);
ensure(resetProof.success && resetProof.automaticRunVerified && resetProof.explicitPauseVerified && resetProof.initialInventory?.food === 30, 'Reset must restore initial resources, auto-run and honor explicit pause');
ensure(animalProof.success && animalProof.moved && animalProof.pauseVerified && animalProof.huntUiVerified && animalProof.model.modelHash === animal.hash && new Set(animalProof.species.filter((s: any) => s.rendererCount > 0).map((s: any) => s.species)).size === 6 && json(`${animalRun}/processes.json`).executable === build.executable && json(`${animalRun}/animal-resume.json`).success && json(`${animalRun}/reset-result.json`).modelSettingsRetained, 'Same-build animal rendering, movement, hunting entry, persistence and settings-preserving reset required');
const hashes = { executableHash: sha(build.executable), gameAssemblyHash: sha(path.join(path.dirname(build.executable), 'GameAssembly.dll')) };
// Publish independent files on D:, avoiding a directory link and a full C: volume.
const executable = publishVillagePackage(root, build.executable, hashes);
for (const head of ['life', 'tactical']) for (const file of ['manifest.json', 'training-report.json', 'weights.bin']) {
  const target = `public/models/village-v4/${head}/${file}`, saved = `${backup}/${head}`; mkdirSync(saved, { recursive: true });
  if (existsSync(target)) copyFileSync(target, `${saved}/${file}`);
  copyFileSync(`${artifacts}/models/${head}/${file}`, target);
}
copyFileSync('public/models/village-v4/release.json', `${backup}/release.json`);
copyFileSync(`${artifacts}/models/release.json`, 'public/models/village-v4/release.json');
const manifest = { format: 'campmind-village-current-v1', verified: true, layout: 'new-world-v1', executable, ...hashes, ruleHash: rules.ruleHash, animalModelHash: animal.hash, animalProbe: path.relative(root, animalRun), releaseHash: sha('public/models/village-v4/release.json'), models: bundle.release.models, promotedUtc: new Date().toISOString(), nativeProbe: path.relative(root, nativeRun), automaticUpgradeProbe: path.relative(root, upgradeRun),
  hostRuntimeUpdate: { kind: 'playable-loop-v1', engineHash: lifeEngineHash(), verification: path.relative(root, `${artifacts}/verification.json`), tests: path.relative(root, `${artifacts}/tests.json`), previousManifest: path.relative(root, `${backup}/village-current.json`), sourceFiles: Object.fromEntries(['scripts/world/village-runtime.ts', 'scripts/world/village-history.ts', 'scripts/world/village-animals.ts', 'scripts/world/village-policy-feedback.ts', 'scripts/world/village-playable-ui.ts', 'native/CampMind.Unity/Assets/CampMind/Presentation/NativeVillageUi.Management.cs', 'native/CampMind.Unity/Assets/CampMind/Presentation/NativeVillageUi.Progression.cs', 'native/CampMind.Unity/Assets/CampMind/Presentation/NativeVillageUi.Workshop.cs'].map(f => [f, sha(f)])), limitations: verification.limitations } };
writeFileSync(marker + '.playable.tmp', JSON.stringify(manifest, null, 2)); renameSync(marker + '.playable.tmp', marker);
writeFileSync('native/Artifacts/village/P6/build.json', JSON.stringify({ ...build, modelsPending: false, defaultModeVerified: true, nativeProbe: manifest.nativeProbe, models: manifest.models }, null, 2));
writeFileSync(`${artifacts}/deployment.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ success: true, executable, models: manifest.models, verification: manifest.hostRuntimeUpdate.verification }));
