import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {getSession} from "@/lib/session";
import {db} from "@/lib/db";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(_r:Request,{params}:{params:Promise<{id:string}>}){
 const s=await getSession();if(!s?.sub)return NextResponse.json({error:"سجّل الدخول."},{status:401});const {id}=await params;
 try{const [t]=await db().execute("SELECT id,user_id,subject,category,status,created_at,updated_at FROM support_tickets WHERE id=? AND user_id=?",[id,String(s.sub)]);if(!(t as any[]).length)return NextResponse.json({error:"طلب الدعم غير موجود."},{status:404});const [messages]=await db().execute("SELECT id,sender_type,body,created_at FROM support_messages WHERE ticket_id=? ORDER BY created_at ASC LIMIT 300",[id]);return NextResponse.json({ticket:(t as any[])[0],messages});}
 catch{return NextResponse.json({error:"تعذر تحميل المحادثة."},{status:503});}
}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 const s=await getSession();if(!s?.sub)return NextResponse.json({error:"سجّل الدخول."},{status:401});const {id}=await params;
 try{const b=await req.json(),body=String(b.message||"").trim();if(body.length<2||body.length>3000)return NextResponse.json({error:"الرسالة مطلوبة وبحد أقصى 3000 حرف."},{status:400});
 const [rows]=await db().execute("SELECT id,status FROM support_tickets WHERE id=? AND user_id=?",[id,String(s.sub)]);if(!(rows as any[]).length)return NextResponse.json({error:"طلب الدعم غير موجود."},{status:404});if(["resolved","closed"].includes((rows as any[])[0].status))return NextResponse.json({error:"تم إغلاق الطلب. أنشئ طلباً جديداً عند الحاجة."},{status:409});
 await db().execute("INSERT INTO support_messages(id,ticket_id,sender_id,sender_type,body) VALUES(?,?,?,'user',?)",[randomUUID(),id,String(s.sub),body]);await db().execute("UPDATE support_tickets SET status='waiting_support',updated_at=CURRENT_TIMESTAMP WHERE id=?",[id]);return NextResponse.json({ok:true},{status:201});
 }catch{return NextResponse.json({error:"تعذر إرسال الرسالة."},{status:503});}
}