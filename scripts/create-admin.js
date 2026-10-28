'use strict';
const path=require('node:path'),fs=require('node:fs');const env=path.join(__dirname,'..','.env');if(fs.existsSync(env))process.loadEnvFile(env);
const {openDatabase,transaction,ledger}=require('../db'),{passwordHash,validatePassword}=require('../security');
(async()=>{
 const email=String(process.env.ADMIN_EMAIL||'').trim().toLowerCase(),username=String(process.env.ADMIN_USERNAME||'').trim().toLowerCase(),name=String(process.env.ADMIN_NAME||'Club administrator').trim();
 if(!/^\S+@\S+\.\S+$/.test(email)||email.length>254||!/^[a-z][a-z0-9_]{2,23}$/.test(username)||name.length<2||name.length>32)throw Error('Set ADMIN_EMAIL, ADMIN_USERNAME and ADMIN_NAME in your server environment.');
 const encoded=await passwordHash(validatePassword(process.env.ADMIN_PASSWORD));const db=await openDatabase();try{
  await transaction(db,async()=>{
   // Fail rather than silently promoting an existing account by an email match.
   if(await db.prepare('SELECT id FROM users WHERE email=? OR username=?').get(email,username))throw Error('Account already exists. Choose a new admin email and username.');
   const r=await db.prepare("INSERT INTO users(username,email,name,password_hash,role,created_at) VALUES(?,?,?,?,'admin',?)").run(username,email,name,encoded,Date.now());
   
   await db.prepare('INSERT INTO admin_audit(admin_id,action,target,details,created_at) VALUES(?,?,?,?,?)').run(r.lastInsertRowid,'admin_created',String(r.lastInsertRowid),'Created by server operator',Date.now());
  });console.log('Administrator created. Sign in at /admin. Remove ADMIN_PASSWORD from your environment after this command.');
 }finally{await db.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
