import { DatabaseSync } from 'node:sqlite';
import { archiveConversations, conversationPage } from './conversation-history';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { restoreGameState } from '../../src/games/camp/simulation/persistence';
import type { GameState } from '../../src/games/camp/simulation/types';
import { createMemorySchema } from './memory-schema';
import { clearMemories, forkJournal, newJournal, readExperiences, validJournal, writeExperiences, type Journal } from './memory-store';
import { maintainSummaries, summaryEvidence } from './memory-summary';
import { retrieveMemories } from '../../packages/npc-core/src';

export interface Checkpoint {
  dialogues?: import('../../src/games/camp/dialogue/records').DialogueRecord[];
  appraisals?: { id:string; sequence:number; payload:unknown }[];
  journal?: Journal;
  version: 1; state: GameState; revision: number; speed: number; at: number;
  pauseUntil: number | null; pauseOwner: string | null;
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export class SnapshotStore {
  private db: DatabaseSync;
  private closed = false;
  private heads = new Map<string, Journal>();
  private conversationBackfills=new Set<string>();
  constructor(file: string) {
    mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY, player TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, checksum TEXT NOT NULL, saved_at INTEGER NOT NULL, quarantined INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS snapshots_player ON snapshots(player, id DESC);
      CREATE TABLE IF NOT EXISTS operations (player TEXT NOT NULL, operation TEXT NOT NULL, PRIMARY KEY(player, operation));`);
    if (!this.db.prepare('PRAGMA table_info(snapshots)').all().some(row => row.name === 'quarantined')) this.db.exec('ALTER TABLE snapshots ADD COLUMN quarantined INTEGER NOT NULL DEFAULT 0');
    createMemorySchema(this.db);
    this.db.exec('CREATE TABLE IF NOT EXISTS conversation_history(id INTEGER PRIMARY KEY,player TEXT NOT NULL,generation TEXT NOT NULL,branch TEXT NOT NULL,key TEXT NOT NULL,payload TEXT NOT NULL,at REAL NOT NULL,kind TEXT NOT NULL,UNIQUE(player,generation,branch,key)); CREATE INDEX IF NOT EXISTS conversation_history_scope ON conversation_history(player,generation,branch,id)');
  }
  players(): string[] { return this.db.prepare('SELECT DISTINCT player FROM snapshots').all().map(row => String(row.player)); }
  seen(player: string, operation: string) { return !!this.db.prepare('SELECT 1 FROM operations WHERE player=? AND operation=?').get(player, operation); }
  load(player: string): { checkpoint: Checkpoint | null; recovered: boolean } {
    const rows = this.db.prepare('SELECT * FROM snapshots WHERE player=? ORDER BY id DESC').all(player);
    let recovered = false;
    const quarantine = (id: unknown) => { recovered = true; this.db.prepare('UPDATE snapshots SET quarantined=1 WHERE id=?').run(Number(id)); };
    for (const row of rows) {
      try {
        if (typeof row.payload !== 'string' || row.payload.length > 1_100_000 || digest(row.payload) !== row.checksum) { quarantine(row.id); continue; }
        const raw = JSON.parse(row.payload) as Checkpoint;
        if (raw.journal !== undefined && !validJournal(raw.journal)) throw new Error('UNSUPPORTED');
        if (raw.version !== 1 || raw.state?.version > 1 || (raw.state?.agency?.version ?? 1) > 1 || raw.state?.npcs?.some(npc =>
          (npc.mind?.version ?? 1) > 1 || (npc.initialSettings?.schemaVersion ?? 1) > 1)) throw new Error('UNSUPPORTED');
        const state = restoreGameState(raw.state);
        if (!state || !Number.isSafeInteger(raw.revision) || raw.revision < 1 || ![1, 2, 4].includes(raw.speed)
          || !Number.isSafeInteger(raw.at) || raw.at < 0
          || !(raw.pauseUntil === null || Number.isSafeInteger(raw.pauseUntil) && raw.pauseUntil >= 0)
          || !(raw.pauseOwner === null || typeof raw.pauseOwner === 'string')
          || (raw.pauseUntil === null) !== (raw.pauseOwner === null)) { quarantine(row.id); continue; }
        const legacyEnded = raw.state.status === 'won' || raw.state.status === 'lost';
        const journal = raw.journal && recovered ? forkJournal(this.db, player, raw.journal) : raw.journal;
        if (journal) this.heads.set(player, journal);
        return { checkpoint: { ...raw, ...(journal ? { journal } : {}), state,
          pauseUntil: legacyEnded ? null : raw.pauseUntil,
          pauseOwner: legacyEnded ? null : raw.pauseOwner,
          revision: recovered ? Math.max(...rows.map(item => Number(item.revision))) + 1 : raw.revision }, recovered };
      } catch (error) {
        if (error instanceof Error && error.message === 'UNSUPPORTED') throw new Error('存档版本不受支持，已保留数据库，请先升级服务');
        quarantine(row.id);
      }
    }
    if (rows.length) throw new Error('全部存档快照均无法恢复，已保留数据库，请从备份恢复');
    return { checkpoint: null, recovered: false };
  }
  save(player: string, value: Checkpoint, operation?: string, resetHistory = false,resetExtension?:(db:DatabaseSync)=>void) {
    if (!restoreGameState(value.state)) throw new Error('世界状态校验失败，未覆盖存档');
    const pending = value.state.agency?.pending ?? [];
    const journal = resetHistory ? newJournal() : value.journal ?? newJournal();
    const savedJournal = { ...journal, watermark: value.state.agency?.sequence ?? 0 };
    const savedState = value.state.agency ? { ...value.state, agency: { ...value.state.agency, pending: [] } } : value.state;
    const payload = JSON.stringify({ ...value, appraisals: [], journal: savedJournal, state: savedState });
    if (payload.length > 1_100_000) throw new Error('世界快照超过容量限制，未覆盖存档');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (resetHistory) {
        this.db.prepare('DELETE FROM conversation_history WHERE player=?').run(player);
        clearMemories(this.db, player);
        // This player's quarantined snapshots and operations are also discarded.
        // Deletion and replacement must roll back together on write failure.
        this.db.prepare('DELETE FROM snapshots WHERE player=?').run(player);
        this.db.prepare('DELETE FROM operations WHERE player=?').run(player);
        resetExtension?.(this.db);
      }
      writeExperiences(this.db, player, savedJournal, pending);
      archiveConversations(this.db,player,{...value,journal:savedJournal});
      for (const npc of new Set(pending.map(e=>e.npcId))) maintainSummaries(this.db, player, savedJournal, npc);
      for (const item of value.appraisals ?? []) this.db.prepare('INSERT OR IGNORE INTO npc_appraisals VALUES(?,?,?,?,?,?)')
        .run(player,savedJournal.generation,savedJournal.branch,item.id,item.sequence,JSON.stringify(item.payload));
      this.db.prepare('INSERT INTO snapshots(player, revision, payload, checksum, saved_at) VALUES (?, ?, ?, ?, ?)').run(player, value.revision, payload, digest(payload), value.at);
      if (operation) this.db.prepare('INSERT INTO operations(player, operation) VALUES (?, ?)').run(player, operation);
      // Quarantined originals survive pruning, including after service restart.
      this.db.prepare('DELETE FROM snapshots WHERE player=? AND quarantined=0 AND id NOT IN (SELECT id FROM snapshots WHERE player=? AND quarantined=0 ORDER BY id DESC LIMIT 20)').run(player, player);
      this.db.exec('COMMIT');
      value.journal = savedJournal;
      this.heads.set(player, savedJournal);
      if (value.state.agency) value.state.agency.pending = [];
      value.appraisals = [];
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  history(player: string) { return this.db.prepare('SELECT payload FROM snapshots WHERE player=? ORDER BY id').all(player).map(row => { try { return JSON.parse(String(row.payload)) as Checkpoint; } catch { return null; } }); }
  conversations(player:string,page:number,through?:number,identity?:string) {
    const journal=this.heads.get(player)??this.load(player).checkpoint?.journal;
    if(!journal)return {items:[],total:0,npc:0,player:0,page:1,pages:1,pageSize:20,through:0,scope:''};
    if(identity&&identity!==`${journal.generation}:${journal.branch}`)throw new Error('旅程已变更，请刷新记录');
    const key=JSON.stringify([player,journal.generation,journal.branch]);
    if(!this.conversationBackfills.has(key)){
      for(const checkpoint of this.history(player))if(checkpoint&&(!checkpoint.journal||checkpoint.journal.generation===journal.generation&&checkpoint.journal.branch===journal.branch))archiveConversations(this.db,player,{...checkpoint,journal});
      this.conversationBackfills.add(key);
    }
    return conversationPage(this.db,player,journal,page,through);
  }
  memories(player: string, npc: string, before?: number, limit = 30) {
    const journal = this.heads.get(player) ?? this.load(player).checkpoint?.journal;
    const items = journal ? readExperiences(this.db, player, journal, npc, before, Math.max(1, Math.min(50,limit))) : [];
    return { items, cursor: items.length ? items[items.length-1].sequence : null, generation: journal?.generation ?? null, branch: journal?.branch ?? null };
  }
  evidence(player:string, journal:Journal, npc:string, now:number, query:string) {
    const events=[...summaryEvidence(this.db,player,journal,npc,query),...readExperiences(this.db,player,journal,npc,Number.MAX_SAFE_INTEGER,64)].sort((a,b)=>a.sequence-b.sequence);
    return retrieveMemories([...new Map(events.map(e=>[e.eventId,e])).values()],{npcId:npc,now,query,limit:12});
  }
  close() { if (!this.closed) { this.closed = true; this.db.close(); } }
}
