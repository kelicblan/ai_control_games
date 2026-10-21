import { DatabaseSync } from 'node:sqlite';
export type CognitionSettings={modelId:string;enabled:boolean;cognition:boolean};
const supported=(id:unknown)=>id==='minimind3'||id==='native:qwen3.5-2b';
export class CognitionSettingsStore {
  private db:DatabaseSync;
  constructor(file:string){this.db=new DatabaseSync(file);this.db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS cognition_settings(player TEXT PRIMARY KEY,payload TEXT NOT NULL)');}
  read(player:string,legacy?:{modelId:string|null;enabled:boolean;cognition:boolean}):CognitionSettings {
    const row=this.db.prepare('SELECT payload FROM cognition_settings WHERE player=?').get(player);
    const value=row?JSON.parse(String(row.payload)):legacy;
    if(!value||!supported(value.modelId))return {modelId:'minimind3',enabled:value?.enabled??true,cognition:true};
    return {modelId:value.modelId,enabled:value.enabled,cognition:value.cognition};
  }
  save(player:string,value:unknown):CognitionSettings {
    const v=value as CognitionSettings;
    if(!v||!supported(v.modelId)||typeof v.enabled!=='boolean'||typeof v.cognition!=='boolean')throw new Error('认知模型设置无效');
    const settings={modelId:v.modelId,enabled:v.enabled,cognition:v.cognition};
    this.db.prepare('INSERT INTO cognition_settings(player,payload) VALUES(?,?) ON CONFLICT(player) DO UPDATE SET payload=excluded.payload').run(player,JSON.stringify(settings));return settings;
  }
  close(){this.db.close();}
}
