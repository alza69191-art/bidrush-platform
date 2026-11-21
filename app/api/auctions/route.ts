import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {db} from "@/lib/db";
import {getSession} from "@/lib/session";
import {ensureAdminSchema} from "@/lib/admin-schema";
import {saveImage} from "@/lib/object-storage";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const MAX_IMAGE_BYTES=15*1024*1024;
function imageType(b:Buffer):string|null{
 if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return "image/jpeg";
 if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return "image/png";
 if(b.length>=12&&b.toString("ascii",0,4)==="RIFF"&&b.toString("ascii",8,12)==="WEBP")return "image/webp";
 if(b.length>=6&&["GIF87a","GIF89a"].includes(b.toString("ascii",0,6)))return "image/gif";
 if(b.length>=2&&b[0]===66&&b[1]===77)return "image/bmp";
 if(b.length>=4&&(b.readUInt32BE(0)===0x49492a00||b.readUInt32BE(0)===0x4d4d002a))return "image/tiff";
 if(b.length>=12&&b.toString("ascii",4,8)==="ftyp"){const brand=b.toString("ascii",8,12);if(["avif","avis"].includes(brand))return "image/avif";if(["heic","heix","hevc","mif1","msf1"].includes(brand))return "image/heic";}
 return null;
}
export async function GET(){
 try{await ensureAdminSchema();await db().execute("UPDATE tasks SET status='expired' WHERE status='live' AND auction_ends_at<=UTC_TIMESTAMP()");
 const [rows]=await db().query("SELECT t.id,t.title,t.description,t.category,t.currency,t.max_budget,t.deadline_at,t.auction_starts_at,t.auction_ends_at,UNIX_TIMESTAMP(t.auction_ends_at)*1000 AS auction_ends_at_ms,t.status,t.created_at,(t.image_key IS NOT NULL OR t.image_data IS NOT NULL) AS has_image,u.display_name AS client_name,(SELECT COUNT(*) FROM bids b WHERE b.task_id=t.id) AS bids_count,(SELECT MIN(amount) FROM bids b WHERE b.task_id=t.id) AS best_bid FROM tasks t JOIN users u ON u.id=t.client_id WHERE t.status='live' AND t.auction_ends_at>UTC_TIMESTAMP() ORDER BY t.auction_ends_at ASC LIMIT 100");
 return NextResponse.json({auctions:rows});}catch(e){console.error("auctions_list_failed",e);return NextResponse.json({error:"تعذر تحميل المزادات."},{status:500});}
}
export async function POST(req:Request){
 const s=await getSession();if(!s?.sub)return NextResponse.json({error:"سجّل الدخول أولاً."},{status:401});if(s.role!=="client"&&s.role!=="admin")return NextResponse.json({error:"إنشاء المزادات متاح للعملاء فقط."},{status:403});
 let storedKey:string|null=null;
 try{
 await ensureAdminSchema();const form=await req.formData();
 const title=String(form.get("title")||"").trim(),description=String(form.get("description")||"").trim(),category=String(form.get("category")||"").trim(),currency=String(form.get("currency")||"USD").toUpperCase();
 const budget=Number(form.get("maxBudget")),duration=Number(form.get("durationMinutes")||5),deadlineHours=Number(form.get("deadlineHours")||24),image=form.get("image");
 if(title.length<8||title.length>160||description.length<30||description.length>5000||category.length<2||category.length>60)return NextResponse.json({error:"العنوان 8 أحرف على الأقل والوصف 30 حرفاً على الأقل."},{status:400});
 if(!Number.isFinite(budget)||budget<=0||budget>1000000||!["USD","EUR","ILS","SAR","AED"].includes(currency)||![5,10,15,30].includes(duration)||!Number.isInteger(deadlineHours)||deadlineHours<1||deadlineHours>720)return NextResponse.json({error:"الميزانية أو العملة أو المدة غير صالحة."},{status:400});
 let mime:string|null=null,name:string|null=null;
 if(image&&typeof image!=="string"&&(image as File).size>0){
  const file=image as File;if(file.size>MAX_IMAGE_BYTES)return NextResponse.json({error:"الحد الأقصى للصورة 15 ميغابايت."},{status:413});
  const bytes=Buffer.from(await file.arrayBuffer());mime=imageType(bytes);if(!mime)return NextResponse.json({error:"صيغة الصورة غير مدعومة أو الملف ليس صورة سليمة. الصيغ المدعومة: JPEG وPNG وWebP وGIF وBMP وTIFF وAVIF وHEIC."},{status:415});
  name=file.name.replace(/[^\p{L}\p{N}._ -]/gu,"_").slice(0,255)||"image";storedKey="auctions/"+randomUUID()+"/"+randomUUID();
  await saveImage(storedKey,bytes,mime);
 }
 const id=randomUUID();
 await db().execute("INSERT INTO tasks(id,client_id,title,description,category,currency,max_budget,deadline_at,auction_starts_at,auction_ends_at,status,image_key,image_mime,image_name) VALUES(?,?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? HOUR),UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? MINUTE),'live',?,?,?)",[id,String(s.sub),title,description,category,currency,budget,deadlineHours,duration,storedKey,mime,name]);
 return NextResponse.json({ok:true,id,imageAttached:Boolean(storedKey)},{status:201});
 }catch(e){const err=e as {code?:string;message?:string};console.error("auction_create_failed",{code:err.code||"UNKNOWN",message:(err.message||"Unknown").slice(0,240)});return NextResponse.json({error:"تعذر إنشاء المزاد. "+(err.code==="ER_BAD_FIELD_ERROR"?"مخطط قاعدة البيانات لم يكتمل بعد.":"تحقق من البيانات والاتصال بالتخزين وقاعدة البيانات.")},{status:500});}
}