import {S3Client,PutObjectCommand,GetObjectCommand} from "@aws-sdk/client-s3";

const endpoint=process.env.AWS_ENDPOINT;
const bucket=process.env.AWS_BUCKET;
function client(){
  if(!endpoint||!bucket||!process.env.AWS_ACCESS_KEY_ID||!process.env.AWS_SECRET_ACCESS_KEY)throw new Error("Object storage is not configured");
  return new S3Client({region:process.env.AWS_REGION||"auto",endpoint,forcePathStyle:false,credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY}});
}
export async function saveImage(key:string,body:Buffer,contentType:string){
  await client().send(new PutObjectCommand({Bucket:bucket!,Key:key,Body:body,ContentType:contentType,CacheControl:"public, max-age=31536000, immutable"}));
}
export async function readImage(key:string){
  const result=await client().send(new GetObjectCommand({Bucket:bucket!,Key:key}));
  if(!result.Body)throw new Error("Image object is empty");
  const bytes=await result.Body.transformToByteArray();
  return {body:Buffer.from(bytes),contentType:result.ContentType||"application/octet-stream"};
}