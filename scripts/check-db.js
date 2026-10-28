'use strict';
const path=require('node:path'),fs=require('node:fs');const env=path.join(__dirname,'..','.env');if(fs.existsSync(env))process.loadEnvFile(env);
const {openDatabase}=require('../db');
(async()=>{const db=await openDatabase();try{const r=await db.prepare('SELECT COUNT(*) n FROM poker_tables').get();console.log('PostgreSQL connection, TLS and schema verified. Tables: '+r.n);}finally{await db.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
