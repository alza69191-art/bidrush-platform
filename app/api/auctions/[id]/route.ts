import {NextResponse} from "next/server";import {db} from "@/lib/db";import {getSession} from "@/lib/session";import {ensureAdminSchema} from "@/lib/admin-schema";export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;try{await ensureAdminSchema();await db().execute("UPDATE tasks SET status='expired' WHERE id=? AND status='live' AND auction_ends_at<=UTC_TIMESTAMP()",[id]);const [rows]=await db().execute("SELECT t.id,t.client_id,t.title,t.description,t.category,t.currency,t.max_budget,t.deadline_at,t.auction_starts_at,t.auction_ends_at,UNIX_TIMESTAMP(t.auction_ends_at)*1000 AS auction_ends_at_ms,t.status,t.winner_bid_id,(SELECT COUNT(*) FROM task_extensions te WHERE te.task_id=t.id) AS extensions_count,(t.image_key IS NOT NULL OR t.image_data IS NOT NULL) AS has_image,u.display_name AS client_name,(SELECT COUNT(*) FROM bids b WHERE b.task_id=t.id) AS bids_count,(SELECT MIN(amount) FROM bids b WHERE b.task_id=t.id) AS best_bid FROM tasks t JOIN users u ON u.id=t.client_id WHERE t.id=? AND t.deleted_at IS NULL LIMIT 1",[id]);const task=(rows as any[])[0];if(!task)return NextResponse.json({error:"المزاد غير موجود."},{status:404});return NextResponse.json({auction:task});}catch(e){console.error("auction_detail_failed",e);return NextResponse.json({error:"تعذر تحميل المزاد."},{status:500});}}
export async function DELETE(_req:Request,{params}:{params:Promise<{id:string}>}){
 const session=await getSession();
 if(!session?.sub)return NextResponse.json({error:"سجّل الدخول أولاً."},{status:401});
 const {id}=await params;
 let connection:any;
 try{
  await ensureAdminSchema();
  connection=await db().getConnection();
  await connection.beginTransaction();
  const [rows]=await connection.execute("SELECT client_id,status,winner_bid_id,(SELECT COUNT(*) FROM bids WHERE task_id=tasks.id) AS bids_count FROM tasks WHERE id=? AND deleted_at IS NULL FOR UPDATE",[id]);
  const task=(rows as any[])[0];
  if(!task){await connection.rollback();return NextResponse.json({error:"المزاد غير موجود أو تم حذفه."},{status:404});}
  if(String(task.client_id)!==String(session.sub)){await connection.rollback();return NextResponse.json({error:"لا تملك صلاحية حذف هذا المزاد."},{status:403});}
  if(Number(task.bids_count)>0||task.winner_bid_id||!["draft","scheduled","live","expired","cancelled"].includes(task.status)){
   await connection.rollback();
   return NextResponse.json({error:"لا يمكن حذف المزاد بعد استلام عروض أو بدء التعاقد. يمكنك التواصل مع الدعم عند الحاجة."},{status:409});
  }
  await connection.execute("UPDATE tasks SET deleted_at=UTC_TIMESTAMP(),status='cancelled' WHERE id=? AND client_id=? AND deleted_at IS NULL",[id,String(session.sub)]);
  await connection.commit();
  return NextResponse.json({ok:true,message:"تم حذف المزاد بنجاح."});
 }catch(e){
  if(connection)await connection.rollback().catch(()=>{});
  console.error("auction_delete_failed",e);
  return NextResponse.json({error:"تعذر حذف المزاد حالياً."},{status:500});
 }finally{connection?.release();}
}
