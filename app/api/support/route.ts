import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {getSession} from "@/lib/session";
import {db} from "@/lib/db";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 const s=await getSession(); if(!s?.sub)return NextResponse.json({error:"سجّل الدخول."},{status:401});
 try{const [rows]=await db().execute("SELECT id,subject,category,status,priority,created_at,updated_at FROM support_tickets WHERE user_id=? ORDER BY updated_at DESC LIMIT 100",[String(s.sub)]);return NextResponse.json({tickets:rows});}
 catch{return NextResponse.json({error:"مركز الدعم غير مفعّل بعد. نفّذ ترحيل قاعدة البيانات."},{status:503});}
}
export async function POST(req:Request){
 const s=await getSession(); if(!s?.sub)return NextResponse.json({error:"سجّل الدخول."},{status:401});
 try{const b=await req.json(),subject=String(b.subject||"").trim(),category=String(b.category||"general"),body=String(b.message||"").trim();
 if(subject.length<4||subject.length>160||body.length<10||body.length>3000)return NextResponse.json({error:"اكتب عنواناً واضحاً ورسالة بين 10 و3000 حرف."},{status:400});
 if(!["general","account","auction","payment","report","technical"].includes(category))return NextResponse.json({error:"تصنيف غير صالح."},{status:400});
 const id=randomUUID();const c=await db().getConnection();try{await c.beginTransaction();await c.execute("INSERT INTO support_tickets(id,user_id,subject,category) VALUES(?,?,?,?)",[id,String(s.sub),subject,category]);await c.execute("INSERT INTO support_messages(id,ticket_id,sender_id,sender_type,body) VALUES(?,?,?,'user',?)",[randomUUID(),id,String(s.sub),body]);await c.commit();}catch(e){await c.rollback();throw e;}finally{c.release();}
 return NextResponse.json({ok:true,ticketId:id},{status:201});
 }catch{return NextResponse.json({error:"تعذر إنشاء طلب الدعم. تحقق من ترحيل قاعدة البيانات."},{status:503});}
}