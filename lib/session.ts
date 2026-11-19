import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
const key = () => { const value=process.env.SESSION_SECRET; if(!value || value.length<32) throw new Error("SESSION_SECRET must be at least 32 characters"); return new TextEncoder().encode(value); };
export async function createSession(user:{id:string,email:string,displayName:string,role:string}) { const token=await new SignJWT({email:user.email,displayName:user.displayName,role:user.role}).setProtectedHeader({alg:"HS256"}).setSubject(user.id).setIssuedAt().setExpirationTime("7d").sign(key()); (await cookies()).set("bidrush_session",token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:60*60*24*7}); }
export async function getSession() { const token=(await cookies()).get("bidrush_session")?.value;if(!token)return null;try{const {payload}=await jwtVerify(token,key());if(!payload.sub)return null;const [rows]=await db().execute("SELECT id,email,display_name,role,status FROM users WHERE id=? LIMIT 1",[payload.sub]);const user=(rows as any[])[0];if(!user||user.status!=="active")return null;return {...payload,email:user.email,displayName:user.display_name,role:user.role,sub:user.id};}catch{return null;} }
export async function clearSession() { (await cookies()).delete("bidrush_session"); }
