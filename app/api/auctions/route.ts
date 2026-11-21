import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {db} from "@/lib/db";
import {getSession} from "@/lib/session";
import {ensureAdminSchema} from "@/lib/admin-schema";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(){
  try{
    await ensureAdminSchema();
    await db().execute("UPDATE tasks SET status='expired' WHERE status='live' AND auction_ends_at<=UTC_TIMESTAMP()");
    const [rows]=await db().query("SELECT t.id,t.title,t.description,t.category,t.currency,t.max_budget,t.deadline_at,t.auction_starts_at,t.auction_ends_at,t.status,t.created_at,(t.image_data IS NOT NULL) AS has_image,u.display_name AS client_name,(SELECT COUNT(*) FROM bids b WHERE b.task_id=t.id) AS bids_count,(SELECT MIN(amount) FROM bids b WHERE b.task_id=t.id) AS best_bid FROM tasks t JOIN users u ON u.id=t.client_id WHERE t.status='live' AND t.auction_ends_at>UTC_TIMESTAMP() ORDER BY t.auction_ends_at ASC LIMIT 100");
    return NextResponse.json({auctions:rows});
  }catch(e){
    console.error("auctions_list_failed",e);
    return NextResponse.json({error:"تعذر تحميل المزادات."},{status:500});
  }
}

export async function POST(req:Request){
  const s=await getSession();
  if(!s?.sub)return NextResponse.json({error:"سجّل الدخول أولاً."},{status:401});
  if(s.role!=="client"&&s.role!=="admin")return NextResponse.json({error:"إنشاء المزادات متاح للعملاء فقط."},{status:403});
  try{
    // Apply schema changes in the request path too; do not depend only on startup timing.
    await ensureAdminSchema();
    const form=await req.formData();
    const title=String(form.get("title")||"").trim();
    const description=String(form.get("description")||"").trim();
    const category=String(form.get("category")||"").trim();
    const currency=String(form.get("currency")||"USD").toUpperCase();
    const budget=Number(form.get("maxBudget"));
    const duration=Number(form.get("durationMinutes")||5);
    const deadlineHours=Number(form.get("deadlineHours")||24);
    const image=form.get("image");
    if(title.length<8||title.length>160||description.length<30||description.length>5000||category.length<2||category.length>60)return NextResponse.json({error:"العنوان 8 أحرف على الأقل والوصف 30 حرفاً على الأقل."},{status:400});
    if(!Number.isFinite(budget)||budget<=0||budget>1000000||!["USD","EUR","ILS","SAR","AED"].includes(currency)||![5,10,15,30].includes(duration)||!Number.isInteger(deadlineHours)||deadlineHours<1||deadlineHours>720)return NextResponse.json({error:"الميزانية أو العملة أو المدة غير صالحة."},{status:400});

    let bytes:Buffer|null=null,mime:string|null=null,name:string|null=null;
    if(image&&typeof image!=="string"&&typeof (image as File).arrayBuffer==="function"&&(image as File).size>0){
      const file=image as File;
      if(file.size>3*1024*1024)return NextResponse.json({error:"حجم الصورة يجب ألا يتجاوز 3 ميغابايت."},{status:413});
      if(!["image/jpeg","image/png","image/webp"].includes(file.type))return NextResponse.json({error:"ارفع صورة JPG أو PNG أو WebP فقط."},{status:400});
      bytes=Buffer.from(await file.arrayBuffer());
      const isJpeg=bytes.length>3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
      const isPng=bytes.length>8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const isWebp=bytes.length>12&&bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";
      if(!(isJpeg||isPng||isWebp))return NextResponse.json({error:"محتوى الملف لا يطابق صيغة صورة صالحة."},{status:400});
      mime=isJpeg?"image/jpeg":isPng?"image/png":"image/webp";
      name=file.name.slice(0,180);
    }

    const id=randomUUID();
    await db().execute("INSERT INTO tasks(id,client_id,title,description,category,currency,max_budget,deadline_at,auction_starts_at,auction_ends_at,status,image_data,image_mime,image_name) VALUES(?,?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? HOUR),UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? MINUTE),'live',?,?,?)",[id,String(s.sub),title,description,category,currency,budget,deadlineHours,duration,bytes,mime,name]);
    return NextResponse.json({ok:true,id,imageAttached:Boolean(bytes)},{status:201});
  }catch(e){
    const err=e as {code?:string;errno?:number;sqlState?:string;message?:string};
    console.error("auction_create_failed",{code:err.code??"UNKNOWN",errno:err.errno??null,sqlState:err.sqlState??null,message:(err.message??"Unknown error").slice(0,240)});
    return NextResponse.json({error:"تعذر إنشاء المزاد. "+(err.code==="ER_BAD_FIELD_ERROR"?"مخطط قاعدة البيانات لم يكتمل بعد.":"تحقق من البيانات والاتصال بقاعدة البيانات.")},{status:500});
  }
}
