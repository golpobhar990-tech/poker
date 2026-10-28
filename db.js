'use strict';
const fs=require('node:fs'),path=require('node:path');
const {AsyncLocalStorage}=require('node:async_hooks');
const {Game}=require('./game');
const context=new AsyncLocalStorage();
async function openDatabase(filename,{pool:providedPool}={}){
 let db;
 if(filename!==undefined){
  // Explicit local database is only used by automated verification.
  const {DatabaseSync}=require('node:sqlite');
  if(filename!==':memory:')fs.mkdirSync(path.dirname(filename),{recursive:true});
  const sql=new DatabaseSync(filename);sql.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  sql.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  db={dialect:'sqlite',prepare:s=>sql.prepare(s),exec:s=>sql.exec(s),close:()=>sql.close()};
 }else{
  if(!process.env.DATABASE_URL&&!providedPool)throw Error('Set DATABASE_URL to your Aiven PostgreSQL service URI.');
  const {Pool,types}=require('pg');types.setTypeParser(20,v=>{const n=Number(v);if(!Number.isSafeInteger(n))throw Error('Database integer exceeds safe range');return n;});
  const uri=new URL(process.env.DATABASE_URL||'postgres://test:test@localhost/test');
  // Explicit TLS settings must not be overridden by URI sslmode parameters.
  for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])uri.searchParams.delete(key);
  const ca=process.env.AIVEN_CA_CERT?.replace(/\\n/g,'\n')||(process.env.AIVEN_CA_PATH?fs.readFileSync(process.env.AIVEN_CA_PATH,'utf8'):undefined);
  const pool=providedPool||new Pool({connectionString:uri.toString(),ssl:{rejectUnauthorized:true,...(ca?{ca}:{})},max:10,connectionTimeoutMillis:10000,statement_timeout:15000});
  const query=(s,args=[])=>{let i=0;s=s.replace(/\?/g,()=>'$'+(++i));return (context.getStore()?.client||pool).query(s,args);};
  db={dialect:'postgres',pool,query,exec:s=>query(s),close:()=>pool.end(),prepare(s){return {
   async get(...args){return (await query(s,args)).rows[0];},
   async all(...args){return (await query(s,args)).rows;},
   async run(...args){const returning=/^\s*INSERT INTO (users|hands|ledger|admin_audit)\b/i.test(s)&&!(/RETURNING/i.test(s));const r=await query(s+(returning?' RETURNING id':''),args);return {changes:r.rowCount,lastInsertRowid:r.rows[0]?.id};}
  };}};
  await db.exec(fs.readFileSync(path.join(__dirname,'schema.postgres.sql'),'utf8'));
 }
 db.queue=Promise.resolve();
 await transaction(db,async()=>{
 const definitions=[['The Garden',10,20,1000],['Copper Lounge',25,50,2500],['Sapphire Room',50,100,5000],['Emerald Club',100,200,10000],['Royal Circle',250,500,25000],['The Penthouse',500,1000,50000]];
 for(const [i,[name,sb,bb,buy]] of definitions.entries()){
  const g=new Game(String(i+1));g.smallBlind=sb;g.bigBlind=bb;
  await db.prepare('INSERT INTO poker_tables(id,name,small_blind,big_blind,buy_in,state) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(i+1,name,sb,bb,buy,JSON.stringify(g));
 }
 });return db;
}
async function transaction(db,fn){
 if(context.getStore()?.db===db)return fn();
 if(db.dialect==='postgres'){
  const client=await db.pool.connect();try{await client.query('BEGIN');
   // One short, global gameplay lock also prevents two application replicas from
   // advancing the same persisted deck or spending the same chips concurrently.
   await client.query('SELECT pg_advisory_xact_lock(70654321)');
   const out=await context.run({db,client},fn);await client.query('COMMIT');return out;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }
 const previous=db.queue;let release;db.queue=new Promise(r=>release=r);await previous;
 try{db.exec('BEGIN IMMEDIATE');const out=await context.run({db},fn);db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}finally{release();}
}
function load(row){return Object.assign(Object.create(Game.prototype),JSON.parse(row.state));}
async function save(db,id,g){g.revision=(g.revision||0)+1;await db.prepare('UPDATE poker_tables SET state=? WHERE id=?').run(JSON.stringify(g),id);}
async function ledger(db,userId,kind,amount,reference=''){const u=await db.prepare('SELECT chips FROM users WHERE id=?').get(userId);await db.prepare('INSERT INTO ledger(user_id,kind,amount,balance_after,reference,created_at) VALUES(?,?,?,?,?,?)').run(userId,kind,amount,u.chips,reference,Date.now());}
module.exports={openDatabase,transaction,load,save,ledger};
