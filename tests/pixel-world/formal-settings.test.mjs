import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const {CognitionSettingsStore}=await import('../../scripts/world/cognition-settings.ts');
function fixture(t,checksumValid=true){const directory=mkdtempSync(path.join(tmpdir(),'pixel-model-settings-')),file=path.join(directory,'world.sqlite');t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const db=new DatabaseSync(file);db.exec('CREATE TABLE snapshots(id INTEGER PRIMARY KEY,player TEXT,payload TEXT,checksum TEXT,quarantined INTEGER)');const payload=JSON.stringify({state:{agency:{modelId:'native:qwen3.5-2b',enabled:false,cognition:false}}});
 db.prepare('INSERT INTO snapshots VALUES(1,?,?,?,0)').run('original-player',payload,checksumValid?createHash('sha256').update(payload).digest('hex'):'corrupted');db.close();return file;}
test('restores old Qwen and disabled settings without loading the retired world',t=>{const file=fixture(t),store=new CognitionSettingsStore(file);try{const expected={modelId:'native:qwen3.5-2b',enabled:false,cognition:false};assert.deepEqual(store.read('original-player'),expected);assert.deepEqual(store.read('original-player'),expected);const db=new DatabaseSync(file);assert.equal(db.prepare('SELECT quarantined FROM snapshots').get().quarantined,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM cognition_settings').get().n,1);db.close();}finally{store.close();}});
test('does not import settings from a corrupted old snapshot',t=>{const file=fixture(t,false),store=new CognitionSettingsStore(file);try{assert.equal(store.read('original-player').modelId,'minimind3');const db=new DatabaseSync(file);assert.equal(db.prepare('SELECT COUNT(*) n FROM cognition_settings').get().n,0);db.close();}finally{store.close();}});
test('keeps an explicit current setting ahead of archived settings',t=>{const file=fixture(t),store=new CognitionSettingsStore(file);try{const current={modelId:'minimind3',enabled:true,cognition:true};store.save('original-player',current);assert.deepEqual(store.read('original-player'),current);}finally{store.close();}});
