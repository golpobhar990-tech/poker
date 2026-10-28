'use strict';
const crypto=require('node:crypto');
async function uploadAvatar(data,userId){
 const cloud=process.env.CLOUDINARY_CLOUD_NAME,key=process.env.CLOUDINARY_API_KEY,secret=process.env.CLOUDINARY_API_SECRET;
 if(!cloud||!key||!secret)throw Error('Profile upload is unavailable. Configure Cloudinary on the server.');
 if(!/^[a-zA-Z0-9_-]+$/.test(cloud))throw Error('Invalid Cloudinary configuration.');
 const timestamp=Math.floor(Date.now()/1000),public_id='poker-four/avatars/'+userId+'-'+crypto.randomUUID();
 const signature=crypto.createHash('sha256').update('public_id='+public_id+'&timestamp='+timestamp+secret).digest('hex');
 const form=new FormData();for(const [k,v] of Object.entries({file:data,public_id,timestamp,api_key:key,signature}))form.append(k,String(v));
 const response=await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`,{method:'POST',body:form,signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Cloudinary upload failed. Check your server configuration and retry.');
 const result=await response.json();const url=new URL(result.secure_url);
 if(url.protocol!=='https:'||url.hostname!=='res.cloudinary.com'||!url.pathname.startsWith('/'+cloud+'/')||result.resource_type!=='image')throw Error('Invalid image upload response.');
 return url.toString();
}
module.exports={uploadAvatar};
