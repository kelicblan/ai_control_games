import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Resume-safe single stages: images are visually reviewed before invoking model.
const [stage, id] = process.argv.slice(2);
const root = path.resolve('../模型/3d模型/属民');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'asset-plan.json'), 'utf8'));
const character = plan.characters.find(c => c.id === id);
if (!character || !['reference', 'model'].includes(stage)) throw new Error('Use reference|model and a known NPC id');
const dir = path.join(root, character.name), recordPath = path.join(dir, `${stage}-task.json`);
if (fs.existsSync(recordPath)) { console.log(fs.readFileSync(recordPath, 'utf8')); process.exit(0); }
fs.mkdirSync(dir, { recursive: true });
const details = {
  linlan: 'MAN age 27, lean body, angular face, slightly rebellious expression, dark hair loosely tied up, faded brick-red coarse linen short cross-collar jacket with narrow sleeves, dark charcoal trousers and plain cloth shoes.',
  aye: 'MAN age 22, lean outdoorsman, sun-tanned skin, curious bright eyes, a few subtle freckles, simple dark cloth headband and tied hair, muted teal coarse cotton short cross-collar tunic, tan trousers, cloth gaiters and worn cloth shoes.',
  tiesheng: 'MAN age 42, sturdy broad shoulders and strong forearms, square weathered face, short stubble beard, tied black hair, plain indigo coarse cotton work jacket with narrow sleeves, simple worn brown leather WORK APRON, dark trousers and sturdy cloth shoes. Ordinary craftsman, no armor.',
  aling: 'WOMAN age 34, average practical build, warm round mature face, kind eyes, simple black hair in a neat bun, muted ochre coarse cotton short cross-collar jacket with narrow sleeves, dark gray practical ankle-length skirt, a plain working cloth apron and dark cloth shoes. Distinct adult woman, no resemblance to a young male face.',
  xiaoman: 'MAN age 20, small slender adult build, lively clever face, friendly slightly mischievous expression, black hair in a simple small tied bun, muted mustard-yellow coarse cotton short cross-collar jacket with narrow sleeves, green-gray trousers, plain cloth belt with a small plain cloth pouch and dark cloth shoes. Adult man, not a child.',
  shenyan: 'MAN age 33, slender upright build, serious calm scholarly face, straight brows, simple dark cloth scholar headwear, plain blue-gray coarse cotton narrow-sleeve knee-length cross-collar robe, plain cloth sash, dark trousers visibly below robe and plain cloth shoes. Modest village clerk, no official rank decoration.'
};
const reference = path.resolve('../模型/3d模型/修真领主/reference/tripo-out/cultivation-lord-reference-f3b3c4ce/generated_image.png');
let args;
if (stage === 'reference') {
  if (!details[id]) throw new Error('This helper covers the remaining six subjects only');
  const prompt = `Exactly ONE full-body front-view realistic ancient Chinese COMMONER. ${details[id]} Match ONLY realistic rendering quality and human proportions of reference. Completely replace the original face and costume with the specified person. Plain visibly textured linen and cotton. No crown, gold, embroidery, jewelry, silk, immortal costume, flowing fantasy robes, armor, weapons or magical effects. Hands empty, no held tools or backpack. Neutral A-pose for skeletal rigging, arms separated from torso, hands and all feet visible, legs separated. One person centered on plain gray background with even lighting.`;
  args = ['generate', 'image-to-image', reference, '--model', 'seedream_v5', '--prompt', prompt, '-p', 'template=t_pose', '-o', path.join(dir, 'reference'), '--name', `subject-${id}-reference`, '--json', '--yes', '--no-open'];
} else {
  const ref = JSON.parse(fs.readFileSync(path.join(dir, 'reference-task.json'), 'utf8'));
  const image = path.join(ref.output_dir, 'generated_image.png');
  if (!fs.existsSync(image)) throw new Error('Missing reviewed reference image');
  args = ['make', image, '--model', 'tripo-v3.1', '-p', 'face_limit=15000', '-p', 'texture=true', '-p', 'pbr=true', '--then', 'rig-check,rig:out_format=glb,spec=mixamo,model=v2.5-20260210', '-o', dir, '--name', `subject-${id}`, '--json', '--yes', '--no-open'];
}
const quote = value => `'${value.replaceAll("'", "''")}'`;
const child = spawn('powershell.exe', ['-NoProfile', '-Command', '& npx.cmd tripo-cli@latest ' + args.map(quote).join(' ')], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = '';
child.stdout.on('data', data => { stdout += data; });
child.stderr.on('data', data => process.stderr.write(data));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', code => {
  if (code !== 0) { process.stdout.write(stdout); process.exitCode = code || 1; return; }
  const lines = stdout.trim().split(/\r?\n/), result = JSON.parse(lines.at(-1));
  fs.writeFileSync(recordPath, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
});
