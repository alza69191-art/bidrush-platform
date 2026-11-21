import {S3Client,PutObjectCommand,GetObjectCommand} from "@aws-sdk/client-s3";
import {createHash} from "node:crypto";

const endpoint=process.env.AWS_ENDPOINT;
const bucket=process.env.AWS_BUCKET;
const cloudName=process.env.CLOUDINARY_CLOUD_NAME;
const cloudKey=process.env.CLOUDINARY_API_KEY;
const cloudSecret=process.env.CLOUDINARY_API_SECRET;

function client(){
  if(!endpoint||!bucket||!process.env.AWS_ACCESS_KEY_ID||!process.env.AWS_SECRET_ACCESS_KEY)throw new Error("Object storage is not configured");
  return new S3Client({region:process.env.AWS_REGION||"auto",endpoint,forcePathStyle:false,credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY}});
}
function cloudinaryReady(){
  const configured=[cloudName,cloudKey,cloudSecret].filter(Boolean).length;
  if(configured!==0&&configured!==3)throw new Error("Cloudinary configuration is incomplete");
  return configured===3;
}
async function saveCloudinary(key:string,body:Buffer,contentType:string){
  const timestamp=Math.floor(Date.now()/1000);
  const folder="bidrush/auctions";
  const publicId=key.replace(/^auctions\//,"").replace(/[^a-zA-Z0-9_/-]/g,"");
  const params=`folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature=createHash("sha1").update(params+cloudSecret).digest("hex");
  const form=new FormData();
  form.append("file",new Blob([new Uint8Array(body)],{type:contentType}),"auction-image");
  form.append("folder",folder);
  form.append("public_id",publicId);
  form.append("timestamp",String(timestamp));
  form.append("api_key",cloudKey!);
  form.append("signature",signature);
  const response=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName!)}/image/upload`,{method:"POST",body:form,cache:"no-store"});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error("Cloudinary upload failed: "+String(result?.error?.message||response.status).slice(0,180));
  if(!result?.public_id)throw new Error("Cloudinary returned no public asset ID");
  return "cloudinary:"+String(result.public_id);
}
export async function saveImage(key:string,body:Buffer,contentType:string):Promise<string>{
  if(cloudinaryReady())return saveCloudinary(key,body,contentType);
  await client().send(new PutObjectCommand({Bucket:bucket!,Key:key,Body:body,ContentType:contentType,CacheControl:"public, max-age=31536000, immutable"}));
  return key;
}
export async function readImage(key:string){
  if(key.startsWith("cloudinary:")){
    if(!cloudName)throw new Error("Cloudinary is not configured for image delivery");
    const publicId=key.slice("cloudinary:".length).split("/").map(encodeURIComponent).join("/");
    const response=await fetch(`https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/upload/f_auto,q_auto/${publicId}`,{cache:"force-cache"});
    if(!response.ok)throw new Error("Cloudinary image delivery failed: "+response.status);
    return {body:Buffer.from(await response.arrayBuffer()),contentType:response.headers.get("content-type")||"image/jpeg"};
  }
  const result=await client().send(new GetObjectCommand({Bucket:bucket!,Key:key}));
  if(!result.Body)throw new Error("Image object is empty");
  const bytes=await result.Body.transformToByteArray();
  return {body:Buffer.from(bytes),contentType:result.ContentType||"application/octet-stream"};
}
