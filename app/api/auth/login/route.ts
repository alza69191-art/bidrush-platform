import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";
export const runtime="nodejs";
export async function POST(req:Request){ try { const body=await req.json(); const email=String(body.email||"").trim().toLowerCase(); const password=String(body.password||""); const [rows]=await db().execute("SELECT id,email,password_hash,display_name,role,status FROM users WHERE email=? LIMIT 1",[email]); const user=(rows as any[])[0]; if(!user||user.status!=="active"||!(await bcrypt.compare(password,user.password_hash))) return NextResponse.json({error:"البريد الإلكتروني أو كلمة المرور غير صحيحة."},{status:401}); await createSession({id:user.id,email:user.email,displayName:user.display_name,role:user.role}); return NextResponse.json({ok:true}); } catch(e){ console.error("login_error",e); return NextResponse.json({error:"تعذر تسجيل الدخول حالياً."},{status:500}); } }
