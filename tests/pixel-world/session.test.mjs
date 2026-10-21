import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {MapSession} from '../../scripts/pixel-world/session.mjs';
import {VILLAGE,resourceById} from '../../src/games/camp/world/pixel/world.mjs';
function fixture(){const dir=mkdtempSync(path.join(tmpdir(),'pixel-map-'));const file=path.join(dir,'world.sqlite');return{dir,file,clean:()=>rmSync(dir,{recursive:true,force:true})};}
test('移动由固定步推进、速度有界、断连后停下，坐标不接受客户端直写',()=>{
  const s=new MapSession(':memory:');try{
    const p=s.snapshot().player;s.setInput({x:1,y:1},100);s.tick(.1,200);
    const q=s.snapshot().player;assert.ok(Math.abs(Math.hypot(q.x-p.x,q.y-p.y)-.45)<.001);
    s.tick(.1,500);assert.deepEqual(s.snapshot().player,q);
    assert.throws(()=>s.setInput({x:2,y:0},600));assert.throws(()=>s.tick(9,600));
  }finally{s.close();}
});
test('采集请求幂等、资源会耗尽，真实SQLite重开仍保留',()=>{
  const f=fixture(),node=resourceById('starter:fiber');let s=new MapSession(f.file);
  try{
    // 显式测试夹具只改独立预览的出生点，不提供网络传送接口。
    s.close();const db=new DatabaseSync(f.file);const state=JSON.parse(db.prepare('select payload from pixel_state where id=1').get().payload);
    state.player={x:node.x,y:node.y+3};db.prepare('update pixel_state set payload=? where id=1').run(JSON.stringify(state));db.close();
    s=new MapSession(f.file);const a=s.interact('op-first');assert.equal(a.resource,'fiber');
    assert.deepEqual(s.interact('op-first'),a);assert.equal(s.snapshot().inventory.find(v=>v.resource==='fiber').amount,1);
    for(let i=1;i<node.amount;i++)s.interact('op-'+i);
    assert.equal(s.remaining(node.id),0);assert.throws(()=>s.interact('op-empty'));
    s.close();s=new MapSession(f.file);assert.equal(s.remaining(node.id),0);
    assert.equal(s.snapshot().inventory.find(v=>v.resource==='fiber').amount,node.amount);
    assert.deepEqual(s.interact('op-first'),a);
  }finally{s.close();f.clean();}
});
test('远处资源不能隔空收取，寨门操作不能远程触发',()=>{
  const s=new MapSession(':memory:');try{assert.throws(()=>s.interact('far-away'));assert.equal(s.snapshot().gateOpen,true);}finally{s.close();}
});
test('独立库带版本标识，不会将正式或不兼容数据库当成新档覆盖',()=>{
  const f=fixture();try{const db=new DatabaseSync(f.file);db.exec('create table village_worlds_v1(id text)');db.close();
    assert.throws(()=>new MapSession(f.file),/正式|其他/);
    const check=new DatabaseSync(f.file);assert.ok(check.prepare("select name from sqlite_master where name='village_worlds_v1'").get());check.close();
  }finally{f.clean();}
});
test('相机勘察分块不会移动玩家，开局探明范围不会解锁全图',()=>{
  const s=new MapSession(':memory:');try{const p=s.snapshot().player;s.chunk(28,28);assert.deepEqual(s.snapshot().player,p);assert.ok(s.snapshot().explored.length<30);
    assert.deepEqual(p,VILLAGE.spawn);assert.equal(s.snapshot().scope,'pixel-game');
  }finally{s.close();}
});
test('远程金矿存在真实有限矿石，采集与重开使用同一账本',()=>{
  const f=fixture(),node=resourceById('mine:northwest:ore');let s=new MapSession(f.file);
  try{
    s.close();const db=new DatabaseSync(f.file),state=JSON.parse(db.prepare('select payload from pixel_state where id=1').get().payload);
    state.player={x:node.x,y:node.y+3};db.prepare('update pixel_state set payload=? where id=1').run(JSON.stringify(state));db.close();
    s=new MapSession(f.file);const receipt=s.interact('gold-once');assert.equal(receipt.resource,'gold');assert.equal(receipt.remaining,499);
    s.close();s=new MapSession(f.file);assert.equal(s.snapshot().inventory.find(v=>v.resource==='gold').amount,1);assert.deepEqual(s.interact('gold-once'),receipt);
  }finally{s.close();f.clean();}
});
test('地图生成版本变化时拒绝读档，保留原始状态而不是静默重置',()=>{
  const f=fixture();try{
    new MapSession(f.file).close();let db=new DatabaseSync(f.file);const state=JSON.parse(db.prepare('select payload from pixel_state where id=1').get().payload);
    state.generator=999;const payload=JSON.stringify(state);db.prepare('update pixel_state set payload=? where id=1').run(payload);db.close();
    assert.throws(()=>new MapSession(f.file),/版本不兼容/);db=new DatabaseSync(f.file);assert.equal(db.prepare('select payload from pixel_state where id=1').get().payload,payload);db.close();
  }finally{f.clean();}
});
test('采集提交失败会同时回滚库存、资源与操作凭据',()=>{
  const f=fixture(),node=resourceById('starter:fiber');let s=new MapSession(f.file);
  try{
    s.close();const db=new DatabaseSync(f.file);const state=JSON.parse(db.prepare('select payload from pixel_state where id=1').get().payload);state.player={x:node.x,y:node.y+3};
    db.prepare('update pixel_state set payload=? where id=1').run(JSON.stringify(state));db.exec("CREATE TRIGGER reject_receipt BEFORE INSERT ON pixel_operations BEGIN SELECT RAISE(ABORT,'receipt fixture failure'); END;");db.close();
    s=new MapSession(f.file);assert.throws(()=>s.interact('fail-once'),/receipt fixture failure/);assert.equal(s.remaining(node.id,node.amount),node.amount);assert.equal(s.snapshot().inventory.find(v=>v.resource==='fiber').amount,0);
    s.db.exec('DROP TRIGGER reject_receipt');assert.equal(s.interact('fail-once').remaining,node.amount-1);
  }finally{s.close();f.clean();}
});
