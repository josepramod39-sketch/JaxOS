import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, realpath, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import type { AppState } from '../shared/types';
import type { CommandReceipt, HistorySearch, StorageInfo, StoredTask, TaskStatus, WorkspaceEvent } from '../shared/persistence';
import type { WorkspaceRepository } from './repository';
import { defaultState, validateState } from './store';

const APP_ID = 0x4a41584f;
const VERSION = 1;
const MAX_BYTES = 32 * 1024 * 1024;
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const key = (conversationId: string, messageId: string) => hash(JSON.stringify([conversationId, messageId]));
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
type Row = Record<string, any>;

/** Reads legacy sources without creating, repairing, renaming or overwriting either file. */
async function legacy(directory: string) {
  let absent = 0;
  for (const filename of ['workspace.json', 'workspace.json.bak']) {
    try {
      const file = path.join(directory, filename); const info = await stat(file);
      if (!info.isFile() || info.size > MAX_BYTES) throw new Error('Invalid legacy file size.');
      const bytes = await readFile(file); const state = validateState(JSON.parse(bytes.toString('utf8')));
      if (filename.endsWith('.bak')) state.notice = 'Imported the valid legacy backup. The unreadable primary and backup were preserved.';
      return { state, source: filename, sha256: hash(bytes) };
    } catch (error) { if (missing(error)) absent++; }
  }
  if (absent === 2) return { state: defaultState() };
  throw new Error('The legacy workspace could not be read. Both original files were preserved; restore a valid backup before retrying.');
}

export class SqliteWorkspaceStore implements WorkspaceRepository {
  readonly file: string;
  private db?: DatabaseSync;
  private loaded = false;
  private searchEngine: 'fts5' | 'basic' = 'fts5';
  constructor(readonly dataDir: string) { this.file = path.join(dataDir, 'workspace.sqlite'); }
  private ready() { if (!this.db || !this.loaded) throw new Error('Workspace must load successfully before use.'); return this.db; }
  private transaction<T>(action: () => T): T {
    const db = this.db!; db.exec('BEGIN IMMEDIATE');
    try { const result = action(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  async load(): Promise<AppState> {
    if (this.loaded) return this.readState();
    await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    try {
      let exists = true;
      try { await stat(this.file); } catch (error) { if (!missing(error)) throw error; exists = false; }
      if (!exists) { const handle = await open(this.file, 'wx', 0o600); await handle.close(); }
      this.db = new DatabaseSync(this.file);
      const db = this.db;
      const application = Number((db.prepare('PRAGMA application_id').get() as Row).application_id);
      const version = Number((db.prepare('PRAGMA user_version').get() as Row).user_version);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      if ((application !== APP_ID && (application !== 0 || tables.length)) || version > VERSION) throw new Error('Unsupported or foreign workspace database. Its files were preserved.');
      db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1500; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
      if (version === 0) {
        const imported = await legacy(this.dataDir);
        this.transaction(() => {
          db.exec(`
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, ordinal INTEGER NOT NULL, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, ordinal INTEGER NOT NULL, project_id TEXT REFERENCES projects(id), data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS messages (row_id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, conversation_id TEXT NOT NULL REFERENCES conversations(id), message_id TEXT NOT NULL, ordinal INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(conversation_id,message_id));
            CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, ordinal INTEGER NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id), data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS daily_items (id TEXT PRIMARY KEY, ordinal INTEGER NOT NULL, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS model_operations (id TEXT PRIMARY KEY, ordinal INTEGER NOT NULL, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, status TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, entity_id TEXT, created_at TEXT NOT NULL, detail TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, kind TEXT NOT NULL, input_hash TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL);
            PRAGMA application_id=${APP_ID};
          `);
          this.writeState(imported.state);
          const counts = this.counts(imported.state);
          this.checkReferences();
          const migration = { source: imported.source, sha256: imported.sha256, importedAt: new Date().toISOString(), counts };
          db.prepare('INSERT OR REPLACE INTO meta(key,data) VALUES (?,?)').run('migration', JSON.stringify(migration));
          this.event('workspace.initialized', undefined, { source: imported.source ?? 'new', counts });
          db.exec(`PRAGMA user_version=${VERSION}`);
        });
      }
      // Canonical state and references must load before derived search can be repaired.
      const state = this.readState(); this.checkReferences();
      this.initializeSearch();
      this.loaded = true;
      return state;
    } catch (error) {
      this.db?.close(); this.db = undefined; this.loaded = false;
      throw new Error(`Workspace database could not be opened. Existing files were preserved. ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  private counts(state: AppState) {
    const counts = { projects: state.projects.length, conversations: state.conversations.length, messages: state.conversations.reduce((n,c) => n+c.messages.length,0), runs: state.runs.length, daily_items: state.dailyItems.length, model_operations: state.modelOperations?.length ?? 0 };
    for (const [table, expected] of Object.entries(counts)) if (Number((this.db!.prepare(`SELECT count(*) AS n FROM ${table}`).get() as Row).n) !== expected) throw new Error(`Migration count mismatch: ${table}.`);
    return counts;
  }
  private checkReferences() { if (this.db!.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Workspace has broken references.'); }
  private readState(): AppState {
    const db = this.db!;
    const header = db.prepare("SELECT data FROM meta WHERE key='workspace'").get() as Row | undefined;
    if (!header) throw new Error('Workspace metadata is missing.');
    const rows = (table: string) => db.prepare(`SELECT data FROM ${table} ORDER BY ordinal`).all().map(row => JSON.parse(String(row.data)));
    const conversations = rows('conversations'); const messages = db.prepare('SELECT conversation_id,data FROM messages ORDER BY ordinal').all();
    const grouped = new Map<string, any[]>();
    for (const row of messages) { const id = String(row.conversation_id); if (!grouped.has(id)) grouped.set(id, []); grouped.get(id)!.push(JSON.parse(String(row.data))); }
    for (const conversation of conversations) conversation.messages = grouped.get(conversation.id) ?? [];
    return validateState({ ...JSON.parse(header.data), projects: rows('projects'), conversations, runs: rows('runs'), dailyItems: rows('daily_items'), modelOperations: rows('model_operations') });
  }
  private sync(table: string, rows: Row[], columns: string[], remove = true) {
    const db = this.db!; const identity = table === 'messages' ? 'key' : 'id';
    const prior = new Map(db.prepare(`SELECT ${identity},data,ordinal FROM ${table}`).all().map(row => [String(row[identity]),row]));
    const names = [identity,'ordinal','data',...columns];
    const upsert = db.prepare(`INSERT INTO ${table}(${names.join(',')}) VALUES (${names.map(()=>'?').join(',')}) ON CONFLICT(${identity}) DO UPDATE SET ${names.slice(1).map(name=>`${name}=excluded.${name}`).join(',')}`);
    for (const row of rows) {
      const previous = prior.get(row[identity]); prior.delete(row[identity]);
      if (!previous || previous.data !== row.data || previous.ordinal !== row.ordinal) upsert.run(...names.map(name=>row[name]));
    }
    if (remove) { const drop = db.prepare(`DELETE FROM ${table} WHERE ${identity}=?`); for (const id of prior.keys()) drop.run(id); }
    return [...prior.keys()];
  }
  private writeState(state: AppState) {
    const db = this.db!;
    const {projects,conversations,runs,dailyItems,modelOperations,...header} = state;
    // Parent removals follow child removals; upserts precede new child references.
    const projectRows = projects.map((p,ordinal)=>({id:p.id,ordinal,data:JSON.stringify(p)}));
    const conversationRows = conversations.map(({messages,...c},ordinal)=>({id:c.id,ordinal,project_id:c.projectId ?? null,data:JSON.stringify(c)}));
    const removedProjects = this.sync('projects',projectRows,[],false);
    const removedConversations = this.sync('conversations',conversationRows,['project_id'],false);
    this.sync('messages', conversations.flatMap(c=>c.messages.map((m,ordinal)=>({key:key(c.id,m.id),ordinal,data:JSON.stringify(m),conversation_id:c.id,message_id:m.id,role:m.role,content:m.content,created_at:m.createdAt}))), ['conversation_id','message_id','role','content','created_at']);
    this.sync('runs',runs.map((r,ordinal)=>({id:r.id,ordinal,project_id:r.projectId,data:JSON.stringify(r)})),['project_id']);
    for (const id of removedConversations) db.prepare('DELETE FROM conversations WHERE id=?').run(id);
    for (const id of removedProjects) db.prepare('DELETE FROM projects WHERE id=?').run(id);
    this.sync('daily_items',dailyItems.map((d,ordinal)=>({id:d.id,ordinal,data:JSON.stringify(d)})),[]);
    this.sync('model_operations',(modelOperations??[]).map((m,ordinal)=>({id:m.id,ordinal,data:JSON.stringify(m)})),[]);
    db.prepare("INSERT INTO meta(key,data) VALUES('workspace',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data").run(JSON.stringify(header));
    this.writeTasks(state);
  }
  private writeTasks(state: AppState) {
    const db = this.db!; const tasks: Omit<StoredTask,'updatedAt'>[] = [];
    const status = (value: string): TaskStatus => value === 'complete' || value === 'passed' ? 'succeeded' : value === 'error' ? 'failed' : value as TaskStatus;
    for (const c of state.conversations) for (const m of c.messages) if (m.role === 'assistant') tasks.push({id:'chat-'+key(c.id,m.id),kind:'chat',sourceId:m.id,conversationId:c.id,projectId:c.projectId,label:c.title,status:m.finishReason==='interrupted'?'interrupted':m.status==='streaming'?(m.phase==='queued'?'queued':'running'):status(m.status),createdAt:m.createdAt});
    for (const r of state.runs) tasks.push({id:'kicad-'+r.id,kind:'kicad',sourceId:r.id,projectId:r.projectId,label:r.kind.toUpperCase(),status:/^Interrupted/.test(r.summary)?'interrupted':status(r.status),createdAt:r.createdAt});
    for (const m of state.modelOperations??[]) tasks.push({id:'model-'+m.id,kind:'model',sourceId:m.id,label:`${m.kind}: ${m.model}`,status:/^Interrupted/.test(m.summary)?'interrupted':status(m.status),createdAt:m.createdAt});
    const get = db.prepare('SELECT status,updated_at,data FROM tasks WHERE id=?');
    const put = db.prepare('INSERT INTO tasks(id,status,updated_at,data) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,data=excluded.data');
    for (const task of tasks) {
      const previous = get.get(task.id) as Row | undefined; const changed = !previous || previous.status !== task.status;
      const updatedAt = changed ? new Date().toISOString() : String(previous.updated_at);
      const serialized=JSON.stringify({...task,updatedAt});
      if (previous?.data!==serialized) put.run(task.id,task.status,updatedAt,serialized);
      if (changed) this.event(previous?'task.status':'task.created',task.id,{kind:task.kind,status:task.status,...(previous?{previous:previous.status}:{})});
    }
  }
  private event(type: string, entityId: string | undefined, detail: Record<string, unknown>) {
    this.db!.prepare('INSERT INTO events(type,entity_id,created_at,detail) VALUES(?,?,?,?)').run(type,entityId??null,new Date().toISOString(),JSON.stringify(detail));
  }
  async save(input: AppState, receipt?: CommandReceipt) {
    const db = this.ready(); const state = validateState(input); const serialized = JSON.stringify(state);
    if (Buffer.byteLength(serialized)>MAX_BYTES) throw new Error('Workspace is full (32 MB). Export or archive old work before adding more.');
    this.transaction(()=>{
      if (receipt && db.prepare('SELECT id FROM commands WHERE id=?').get(receipt.id)) throw new Error('This command was already admitted. Refresh its recorded result.');
      this.writeState(state);
      if (receipt) {
        db.prepare('INSERT INTO commands(id,kind,input_hash,result,created_at) VALUES(?,?,?,?,?)').run(receipt.id,receipt.kind,receipt.inputHash,JSON.stringify(receipt.result??null),receipt.createdAt);
        this.event('command.admitted',receipt.id,{kind:receipt.kind});
      }
      const digest = hash(serialized); const prior = db.prepare("SELECT data FROM meta WHERE key='snapshot_hash'").get() as Row | undefined;
      if (prior?.data !== digest) {
        db.prepare("INSERT INTO meta(key,data) VALUES('snapshot_hash',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data").run(digest);
        this.event('workspace.saved',undefined,{sha256:digest});
      }
    });
  }
  getCommand(id: string): CommandReceipt | undefined {
    const row = this.ready().prepare('SELECT * FROM commands WHERE id=?').get(id) as Row | undefined;
    return row ? {id:String(row.id),kind:String(row.kind),inputHash:String(row.input_hash),result:JSON.parse(row.result),createdAt:String(row.created_at)} : undefined;
  }
  private initializeSearch() {
    const db = this.db!;
    try {
      db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content,content='messages',content_rowid='row_id');");
      db.exec(`CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN INSERT INTO messages_fts(rowid,content) VALUES(new.row_id,new.content); END;
        CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN INSERT INTO messages_fts(messages_fts,rowid,content) VALUES('delete',old.row_id,old.content); END;
        CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN INSERT INTO messages_fts(messages_fts,rowid,content) VALUES('delete',old.row_id,old.content); INSERT INTO messages_fts(rowid,content) VALUES(new.row_id,new.content); END;`);
      try { db.exec("INSERT INTO messages_fts(messages_fts,rank) VALUES('integrity-check',1)"); }
      catch { db.exec("INSERT INTO messages_fts(messages_fts) VALUES('rebuild')"); }
      this.searchEngine='fts5';
    } catch (error) {
      if (!/no such module: fts5/i.test(String(error))) throw error;
      db.exec('DROP TRIGGER IF EXISTS messages_ai; DROP TRIGGER IF EXISTS messages_ad; DROP TRIGGER IF EXISTS messages_au;');
      this.searchEngine='basic';
    }
  }
  rebuildSearch() { this.ready(); if (this.searchEngine==='fts5') this.db!.exec("INSERT INTO messages_fts(messages_fts) VALUES('rebuild')"); else this.initializeSearch(); }
  search(query: string, limit = 30): HistorySearch {
    const db = this.ready();
    if (typeof query!=='string' || query.length>300 || !Number.isInteger(limit) || limit<1 || limit>100) throw new Error('Search requires up to 300 characters and a limit of 1–100.');
    const terms = query.match(/[\p{L}\p{N}_]+/gu)?.slice(0,12) ?? [];
    if (!terms.length) return {hits:[],engine:this.searchEngine};
    const base = 'SELECT m.message_id,m.conversation_id,m.role,m.created_at,c.data AS conversation,m.content';
    let rows: Row[];
    if (this.searchEngine==='fts5') {
      const statement=db.prepare(`${base},snippet(messages_fts,0,'','',' … ',32) AS excerpt FROM messages_fts JOIN messages m ON m.row_id=messages_fts.rowid JOIN conversations c ON c.id=m.conversation_id WHERE messages_fts MATCH ? ORDER BY bm25(messages_fts),m.created_at DESC LIMIT ?`);
      const run=()=>statement.all(terms.map(term=>'"'+term+'"*').join(' AND '),limit) as Row[];
      try { rows=run(); } catch(error) { if(!/malformed|corrupt|fts5/i.test(String(error)))throw error; this.rebuildSearch();rows=run(); }
    } else {
      rows=db.prepare(`${base},substr(m.content,1,300) AS excerpt FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE ${terms.map(()=>"m.content LIKE ? ESCAPE '\\'").join(' AND ')} ORDER BY m.created_at DESC LIMIT ?`).all(...terms.map(t=>'%'+t.replace(/[\\%_]/g,'\\$&')+'%'),limit) as Row[];
    }
    return {engine:this.searchEngine,hits:rows.map(r=>({conversationId:r.conversation_id,messageId:r.message_id,title:JSON.parse(r.conversation).title,role:r.role,excerpt:r.excerpt,createdAt:r.created_at}))};
  }
  events(after=0,limit=100): WorkspaceEvent[] {
    if (!Number.isSafeInteger(after)||after<0||!Number.isInteger(limit)||limit<1||limit>500) throw new Error('Invalid event cursor or limit.');
    return this.ready().prepare('SELECT * FROM events WHERE sequence>? ORDER BY sequence LIMIT ?').all(after,limit).map(r=>({sequence:Number(r.sequence),type:String(r.type),entityId:r.entity_id===null?undefined:String(r.entity_id),createdAt:String(r.created_at),detail:JSON.parse(String(r.detail))}));
  }
  tasks(limit=100): StoredTask[] {
    if (!Number.isInteger(limit)||limit<1||limit>500) throw new Error('Invalid task limit.');
    return this.ready().prepare('SELECT data FROM tasks ORDER BY updated_at DESC,id LIMIT ?').all(limit).map(r=>JSON.parse(String(r.data)));
  }
  info(): StorageInfo {
    const db=this.ready(); const migration=JSON.parse(String((db.prepare("SELECT data FROM meta WHERE key='migration'").get() as Row).data));
    return {backend:'sqlite',version:VERSION,sqliteVersion:String((db.prepare('SELECT sqlite_version() AS v').get() as Row).v),search:this.searchEngine,...(migration.source?{importedFrom:migration.source,importedAt:migration.importedAt}:{})};
  }
  async backupTo(destination: string) {
    const db=this.ready(); if (!path.isAbsolute(destination) || !/\.(sqlite|db)$/i.test(destination)) throw new Error('Choose an absolute .sqlite or .db backup path.');
    const directory=await realpath(path.dirname(destination)); const target=path.join(directory,path.basename(destination));
    if (directory.toLowerCase()===(await realpath(this.dataDir)).toLowerCase()) throw new Error('Save the backup outside the active workspace directory.');
    const temporary=target+'.'+randomUUID()+'.tmp';
    try {
      const handle=await open(temporary,'wx',0o600);await handle.close();
      await backup(db,temporary);
      const copy=new DatabaseSync(temporary,{readOnly:true});
      try { if ((copy.prepare('PRAGMA quick_check').get() as Row).quick_check!=='ok') throw new Error('The backup did not pass its integrity check.'); }
      finally { copy.close(); }
      await rename(temporary,target);
    } finally { await unlink(temporary).catch(()=>{}); }
  }
  async flush() { this.ready(); /* FULL synchronous commits already completed before save resolves. */ }
  async close() { if (this.db) { this.db.close();this.db=undefined;this.loaded=false; } }
}
