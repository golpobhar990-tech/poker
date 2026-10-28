'use strict';
const crypto=require('node:crypto'),{promisify}=require('node:util');const scrypt=promisify(crypto.scrypt);
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
async function passwordHash(password){const salt=crypto.randomBytes(16).toString('hex');const key=await scrypt(password,salt,64,{N:16384,r:8,p:1});return 'scrypt$'+salt+'$'+key.toString('hex');}
async function verifyPassword(password,encoded){const [scheme,salt,stored]=String(encoded).split('$');const key=await scrypt(password,salt||'dummy-salt',64,{N:16384,r:8,p:1});return scheme==='scrypt'&&stored?.length===128&&crypto.timingSafeEqual(key,Buffer.from(stored,'hex'));}
function validatePassword(v){if(typeof v!=='string'||v.length<10||v.length>128)throw Error('Password must be 10–128 characters.');return v;}
async function limit(db,key,max,windowMs){
 const now=Date.now();const r=await db.prepare(`INSERT INTO rate_limits(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.reset_at<=? THEN 1 ELSE rate_limits.count+1 END,reset_at=CASE WHEN rate_limits.reset_at<=? THEN excluded.reset_at ELSE rate_limits.reset_at END RETURNING count`).get(key,now+windowMs,now,now);
 if(r.count>max){const e=Error('Too many attempts. Please try again later.');e.status=429;throw e;}
}
function safeUser(u){return {id:u.id,username:u.username,email:u.email,name:u.name,avatar:u.avatar,role:u.role||'player', chips:u.chips,settings:JSON.parse(u.settings),createdAt:u.created_at};}
function validateAvatar(v){if(v===null||v==='')return null;if(typeof v!=='string'||v.length>210000)throw Error('Choose a JPEG/PNG image smaller than 150 KB.');const match=v.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);if(!match)throw Error('Only JPEG and PNG profile photos are supported.');const bytes=Buffer.from(match[2],'base64');if(bytes.length>150000||bytes.length<12)throw Error('Invalid image size.');if(match[1]==='png'&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Invalid PNG image.');if(match[1]==='jpeg'&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))throw Error('Invalid JPEG image.');return v;}
module.exports={hash,passwordHash,verifyPassword,validatePassword,limit,safeUser,validateAvatar};
