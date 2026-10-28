'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {newDb,DataType}=require('pg-mem');const {openDatabase,transaction,load,save}=require('../db');const {limit}=require('../security');
test('PostgreSQL schema and application SQL work through the pg adapter',async()=>{
 const memory=newDb();memory.public.registerFunction({name:'pg_advisory_xact_lock',args:[DataType.integer],returns:DataType.integer,implementation:()=>1});
 const {Pool}=memory.adapters.createPg();const db=await openDatabase(undefined,{pool:new Pool()});try{
 assert.equal(db.dialect,'postgres');assert.equal((await db.prepare('SELECT COUNT(*) n FROM poker_tables').get()).n,6);
 await transaction(db,async()=>{
 const a=await db.prepare('INSERT INTO users(username,email,name,password_hash,created_at) VALUES(?,?,?,?,?)').run('pg_player','pg@example.test','PG Player','not-a-real-password-hash',Date.now());
 assert.equal(a.lastInsertRowid,1);assert.equal((await db.prepare('SELECT * FROM users WHERE id=?').get(1)).role,'player');
 await db.prepare('UPDATE users SET chips=chips - CAST(? AS BIGINT) WHERE id=? AND chips>=?').run(1000,1,1000);
 const g=load(await db.prepare('SELECT * FROM poker_tables WHERE id=?').get(1));const p=g.join('PG Player');p.userId=1;p.chips=1000;await save(db,1,g);
 const {ledger}=require('../db');await ledger(db,1,'buy_in',-1000,'PostgreSQL check');
 assert.equal((await db.prepare('SELECT chips FROM users WHERE id=?').get(1)).chips,4000);
 await db.prepare('INSERT INTO operations VALUES(?,?,?,?,?,?)').run(1,'request-key-123456','/api/test','hash','{}',Date.now());
 });
 // pg-mem does not implement PostgreSQL rollback/advisory lock concurrency;
 // those guarantees require the separate live-service check documented in README.
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM ledger').get()).n,1);
 }finally{await db.close();}
});
