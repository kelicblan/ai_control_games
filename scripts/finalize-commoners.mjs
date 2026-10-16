import fs from 'node:fs';
import path from 'node:path';

const balance = Number(process.argv[2]);
if (!Number.isFinite(balance) || balance < 0) throw new Error('Pass the verified remaining API balance');
const root = path.resolve('../模型/3d模型/属民'), planPath = path.join(root, 'asset-plan.json'), reportPath = path.join(root, 'generation-report.json');
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8')), old = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const original = new Map(old.completed.map(row => [row.id, row]));
const remaining = ['linlan', 'aye', 'tiesheng', 'aling', 'xiaoman', 'shenyan'];
const rows = plan.characters.map(({ id, name }) => {
  const file = path.resolve(`public/assets/models/subjects/${id}/model.glb`), bytes = fs.readFileSync(file);
  const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  const faces = doc.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((n, p) => n + doc.accessors[p.indices].count / 3, 0), 0);
  if (faces > 15000 || doc.animations?.length !== 7 || !doc.skins?.length || !doc.images?.length) throw new Error(`Invalid delivered model: ${id}`);
  let row = original.get(id);
  if (remaining.includes(id)) {
    const reference = JSON.parse(fs.readFileSync(path.join(root, name, 'reference-task.json'), 'utf8'));
    const model = JSON.parse(fs.readFileSync(path.join(root, name, 'model-task.json'), 'utf8'));
    if (reference.status !== 'success' || model.status !== 'success') throw new Error(`Incomplete generation: ${id}`);
    const costs = [{ task_id: reference.task_id, step: 'reference', credits_consumed: reference.credits_consumed },
      ...model.credits_breakdown.map(t => ({ task_id: t.task_id, step: t.type, credits_consumed: t.credits_consumed }))];
    row = { id, name, tasks: costs.map(t => t.task_id), credits_breakdown: costs, total_credits: costs.reduce((sum, t) => sum + t.credits_consumed, 0) };
  }
  if (!row) throw new Error(`Missing original cost record: ${id}`);
  const destination = path.join(root, name, `${name}-古代属民-含动画.glb`);
  fs.copyFileSync(file, destination);
  return { ...row, file: destination, bytes: bytes.length, triangles: faces, joints: doc.skins[0].joints.length, images: doc.images.length, animations: doc.animations.map(a => a.name) };
});
const report = { completed: rows, total_credits: rows.reduce((n, r) => n + r.total_credits, 0),
  last_batch_credits: rows.filter(r => remaining.includes(r.id)).reduce((n, r) => n + r.total_credits, 0),
  balance_before_last_batch: plan.balance_before_remaining_batch, remaining_balance: balance, frozen: 0,
  animation_author: 'Local original skeletal animation', local_animation_credits: 0, pending: [], estimated_remaining_cost: 0, additional_balance_needed: 0 };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
plan.completed = rows.map(r => r.id); plan.current_balance = balance; plan.status = 'All nine textured, rigged and animated commoners delivered and integrated';
fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
console.log(JSON.stringify({ characters: rows.map(({ name, triangles, bytes, total_credits }) => ({ name, triangles, bytes, total_credits })), last_batch_credits: report.last_batch_credits, total_credits: report.total_credits, remaining_balance: balance }, null, 2));
