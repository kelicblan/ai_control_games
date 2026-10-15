import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import { validateRemote, type RemoteConfig } from '../../src/shared/remote-model';
import { remoteCompletion } from '../native-models/remote';

export class RemoteCredentialStore {
  private db: DatabaseSync;
  private secret: Buffer;
  private closed = false;
  constructor(file: string) {
    mkdirSync(path.dirname(file), { recursive: true }); this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS remote_models (player TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
        base_url TEXT NOT NULL, model TEXT NOT NULL, requires_key INTEGER NOT NULL, api_key BLOB NOT NULL,
        updated_at INTEGER NOT NULL, PRIMARY KEY(player,id));`);
    const keyFile = `${file}.remote-key`;
    try {
      try { this.secret = readFileSync(keyFile); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        if (Number(this.db.prepare('SELECT COUNT(*) AS n FROM remote_models').get()!.n)) throw new Error('远程模型密钥文件缺失，请恢复对应密钥文件');
        try { writeFileSync(keyFile, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
        catch (writeError) { if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError; }
        this.secret = readFileSync(keyFile);
      }
      if (this.secret.length !== 32) throw new Error('远程模型密钥文件格式无效');
    } catch (error) { this.db.close(); throw error; }
  }
  private row(player: string, id: string) { return this.db.prepare('SELECT * FROM remote_models WHERE player=? AND id=?').get(player, id); }
  private metadata(row: Record<string, unknown>): RemoteConfig {
    return { id: String(row.id), name: String(row.name), baseUrl: String(row.base_url), model: String(row.model),
      requiresKey: Number(row.requires_key) === 1, hasKey: (row.api_key as Uint8Array).byteLength > 29 };
  }
  list(player: string) { return this.db.prepare('SELECT * FROM remote_models WHERE player=? ORDER BY updated_at,id').all(player).map(row => this.metadata(row)); }
  private encrypt(player: string, id: string, key: string) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.secret, iv);
    cipher.setAAD(Buffer.from(JSON.stringify([player, id])));
    const ciphertext = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), ciphertext]);
  }
  private decrypt(player: string, id: string, raw: Uint8Array) {
    try {
      const bytes = Buffer.from(raw); if (bytes[0] !== 1 || bytes.length < 29) throw new Error();
      const cipher = createDecipheriv('aes-256-gcm', this.secret, bytes.subarray(1, 13));
      cipher.setAAD(Buffer.from(JSON.stringify([player, id]))); cipher.setAuthTag(bytes.subarray(13, 29));
      return Buffer.concat([cipher.update(bytes.subarray(29)), cipher.final()]).toString('utf8');
    } catch { throw new Error('远程模型密钥无法读取，请重新填写或恢复密钥文件'); }
  }
  draftCredentials(player: string, raw: unknown, override?: unknown) {
    const config = validateRemote(raw), row = this.row(player, config.id);
    if (override !== undefined && (typeof override !== 'string' || override.length > 4096 || /[\r\n]/.test(override))) throw new Error('API Key 格式无效');
    let apiKey = typeof override === 'string' ? override.trim() : row ? this.decrypt(player, config.id, row.api_key as Uint8Array) : '';
    if (override === undefined && apiKey && row && new URL(config.baseUrl).origin !== new URL(String(row.base_url)).origin) throw new Error('更换接口域名时请重新填写 API Key');
    if (override === '') apiKey = '';
    return { config: { ...config, requiresKey: apiKey ? true : override === undefined && config.requiresKey }, apiKey };
  }
  save(player: string, raw: unknown, apiKey?: unknown) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = this.draftCredentials(player, raw, apiKey), config = value.config;
      if (!this.row(player, config.id) && Number(this.db.prepare('SELECT COUNT(*) AS n FROM remote_models WHERE player=?').get(player)!.n) >= 32) throw new Error('最多配置 32 个远程模型');
      this.db.prepare(`INSERT INTO remote_models VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(player,id) DO UPDATE SET
        name=excluded.name,base_url=excluded.base_url,model=excluded.model,requires_key=excluded.requires_key,api_key=excluded.api_key,updated_at=excluded.updated_at`)
        .run(player, config.id, config.name, config.baseUrl, config.model, config.requiresKey ? 1 : 0, this.encrypt(player, config.id, value.apiKey), Date.now());
      this.db.exec('COMMIT'); return this.list(player);
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  credentials(player: string, id: string) {
    const row = this.row(player, id); if (!row) throw new Error('远程模型配置不存在');
    const config = this.metadata(row), apiKey = this.decrypt(player, id, row.api_key as Uint8Array);
    if (config.requiresKey && !apiKey) throw new Error('请为远程模型填写 API Key 并保存到数据库');
    return { config, apiKey };
  }
  remove(player: string, id: string) { this.db.prepare('DELETE FROM remote_models WHERE player=? AND id=?').run(player, id); return this.list(player); }
  close() { if (!this.closed) { this.closed = true; this.db.close(); this.secret.fill(0); } }
}

export async function remoteSettingsRoute(req: IncomingMessage, route: string, player: string, store: RemoteCredentialStore,
  signal: AbortSignal, invalidate?: (id:string)=>void): Promise<unknown> {
  if (req.method === 'GET' && route === '/game-api/remote-models') return { models: store.list(player) };
  if (req.method !== 'POST' || !(req.headers['content-type'] ?? '').startsWith('application/json')) throw new Error('需要 JSON 请求');
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > 40000) throw new Error('请求过大'); chunks.push(bytes); }
  let input;
  try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('请求 JSON 无效'); }
  if (!input || typeof input !== 'object') throw new Error('远程配置请求无效');
  if (route === '/game-api/remote-models') {
    if (input.action === 'save') { const models=store.save(player,input.config,input.apiKey);if(typeof input.config?.id==='string')invalidate?.(input.config.id);return {models}; }
    if (input.action === 'delete' && typeof input.id === 'string') { const models=store.remove(player,input.id);invalidate?.(input.id);return {models}; }
  }
  if (route === '/game-api/remote-models/generate' && typeof input.id === 'string') {
    return remoteCompletion({ ...store.credentials(player, input.id), prompt: input.prompt, test: input.test === true }, signal);
  }
  if (route === '/game-api/remote-models/test') {
    return remoteCompletion({ ...store.draftCredentials(player, input.config, input.apiKey), prompt: '请只回复：准备好了。', test: true }, signal);
  }
  throw new Error('远程配置接口不存在');
}
