import {NextResponse} from "next/server";
import {randomUUID,timingSafeEqual} from "node:crypto";
import {getAddress} from "ethers";
import {db} from "@/lib/db";
import {ensureAdminSchema} from "@/lib/admin-schema";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function authorized(req:Request){const expected=process.env.ADMIN_API_KEY||"",provided=req.headers.get("x-admin-api-key")||"";if(expected.length<32||provided.length!==expected.length)return false;try{return timingSafeEqual(Buffer.from(expected),Buffer.from(provided));}catch{return false;}}
function denied(){return NextResponse.json({error:"Unauthorized"},{status:401});}
export async function GET(req:Request){
 if(!authorized(req))return denied();const view=new URL(req.url).searchParams.get("view")||"overview";
 try{
  await ensureAdminSchema();
  if(view==="escrow"){const [rows]=await db().execute("SELECT e.*,t.title,uc.display_name AS client_name,uf.display_name AS freelancer_name,(SELECT COUNT(*) FROM escrow_disputes d WHERE d.escrow_id=e.id AND d.status IN ('open','reviewing')) AS open_disputes FROM escrow_transactions e LEFT JOIN tasks t ON t.id=e.task_id LEFT JOIN users uc ON uc.id=e.client_id LEFT JOIN users uf ON uf.id=e.freelancer_id ORDER BY e.updated_at DESC LIMIT 500");return NextResponse.json({escrows:rows});}
  if(view==="escrow_settings"){const [rows]=await db().execute("SELECT provider,network,token,max_hold_days,commission_bps,platform_wallet_address,updated_at FROM escrow_settings WHERE id=1");return NextResponse.json({settings:(rows as any[])[0]||null});}
  if(view==="users"){const [rows]=await db().execute("SELECT id,email,display_name,role,status,created_at,deleted_at FROM users ORDER BY created_at DESC LIMIT 500");return NextResponse.json({users:rows});}
  if(view==="reports"){const [rows]=await db().execute("SELECT r.id,r.task_id,r.reporter_id,r.reason,r.details,r.status,r.created_at,u.email,u.display_name FROM reports r JOIN users u ON u.id=r.reporter_id ORDER BY r.created_at DESC LIMIT 500");return NextResponse.json({reports:rows});}
  if(view==="tickets"){const [rows]=await db().execute("SELECT t.id,t.user_id,t.subject,t.category,t.status,t.priority,t.created_at,t.updated_at,u.email,u.display_name,(SELECT body FROM support_messages m WHERE m.ticket_id=t.id ORDER BY m.created_at DESC LIMIT 1) last_message,(SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id=t.id) message_count FROM support_tickets t JOIN users u ON u.id=t.user_id ORDER BY FIELD(t.status,'open','waiting_support','waiting_user','resolved','closed'),t.updated_at DESC LIMIT 500");return NextResponse.json({tickets:rows});}
  if(view==="thread"){const id=new URL(req.url).searchParams.get("id");if(!id)return NextResponse.json({error:"Missing ticket id"},{status:400});const [tickets]=await db().execute("SELECT t.*,u.email,u.display_name FROM support_tickets t JOIN users u ON u.id=t.user_id WHERE t.id=?",[id]);if(!(tickets as any[]).length)return NextResponse.json({error:"Not found"},{status:404});const [messages]=await db().execute("SELECT id,sender_type,body,created_at FROM support_messages WHERE ticket_id=? ORDER BY created_at ASC LIMIT 300",[id]);return NextResponse.json({ticket:(tickets as any[])[0],messages});}
  const [userRows]=await db().execute("SELECT COUNT(*) total FROM users WHERE deleted_at IS NULL");const [ticketRows]=await db().execute("SELECT COUNT(*) total FROM support_tickets WHERE status IN ('open','waiting_support')");const [reportRows]=await db().execute("SELECT COUNT(*) total FROM reports WHERE status IN ('open','reviewing')");
  return NextResponse.json({overview:{users:(userRows as any[])[0].total,openTickets:(ticketRows as any[])[0].total,openReports:(reportRows as any[])[0].total}});
 }catch{return NextResponse.json({error:"Database migration is required."},{status:503});}
}
export async function POST(req:Request){
 if(!authorized(req))return denied();
 try{const b=await req.json(),ticketId=String(b.ticketId||""),body=String(b.message||"").trim();if(!ticketId||body.length<2||body.length>3000)return NextResponse.json({error:"Invalid ticket reply"},{status:400});
 const [rows]=await db().execute("SELECT id,user_id,status FROM support_tickets WHERE id=?",[ticketId]);const t=(rows as any[])[0];if(!t)return NextResponse.json({error:"Ticket not found"},{status:404});if(["resolved","closed"].includes(t.status))return NextResponse.json({error:"Ticket is closed"},{status:409});
 await db().execute("INSERT INTO support_messages(id,ticket_id,sender_id,sender_type,body) VALUES(?,?,NULL,'admin',?)",[randomUUID(),ticketId,body]);await db().execute("UPDATE support_tickets SET status='waiting_user',updated_at=CURRENT_TIMESTAMP WHERE id=?",[ticketId]);await db().execute("INSERT INTO notifications(id,user_id,type,title,body,href) VALUES(?,?,?,?,?,?)",[randomUUID(),t.user_id,"support_reply","رد جديد من الدعم",body.slice(0,140),"/support"]);return NextResponse.json({ok:true},{status:201});
 }catch{return NextResponse.json({error:"Could not send reply."},{status:503});}
}
export async function PATCH(req:Request){
 if(!authorized(req))return denied();
 try{const b=await req.json();
  if(b.action==="user_status"){const id=String(b.userId||""),status=String(b.status||"");if(!id||!["active","suspended"].includes(status))return NextResponse.json({error:"Invalid user status"},{status:400});const [r]=await db().execute("UPDATE users SET status=? WHERE id=? AND deleted_at IS NULL AND role<>'admin'",[status,id]);return NextResponse.json({ok:true,changed:(r as any).affectedRows});}
  if(b.action==="delete_user"){
   const id=String(b.userId||"");
   if(!id)return NextResponse.json({error:"Missing user id"},{status:400});
   const c=await db().getConnection();
   try{
    await c.beginTransaction();
    const [rows]=await c.execute("SELECT id,role FROM users WHERE id=? FOR UPDATE",[id]);
    const user=(rows as any[])[0];
    if(!user||["admin","moderator"].includes(String(user.role))){
     await c.rollback();
     return NextResponse.json({error:"User not found or protected"},{status:404});
    }
    // Preserve the integrity of other owners' auctions if this user had won them.
    await c.execute(
     "UPDATE tasks t INNER JOIN bids b ON b.id=t.winner_bid_id SET t.winner_bid_id=NULL,t.status='cancelled' WHERE b.freelancer_id=? AND t.client_id<>?",
     [id,id]
    );
    // Remove all conversations and support data connected to this account.
    await c.execute("DELETE FROM task_messages WHERE sender_id=? OR recipient_id=? OR task_id IN (SELECT id FROM tasks WHERE client_id=?)",[id,id,id]);
    await c.execute("DELETE FROM support_messages WHERE sender_id=? OR ticket_id IN (SELECT id FROM support_tickets WHERE user_id=?)",[id,id]);
    await c.execute("DELETE FROM support_tickets WHERE user_id=?",[id]);
    // Remove task-related records before deleting the user's own auctions.
    await c.execute("DELETE FROM task_extensions WHERE actor_id=? OR task_id IN (SELECT id FROM tasks WHERE client_id=?)",[id,id]);
    await c.execute("DELETE FROM task_events WHERE actor_id=? OR task_id IN (SELECT id FROM tasks WHERE client_id=?)",[id,id]);
    await c.execute("DELETE FROM work_submissions WHERE freelancer_id=? OR task_id IN (SELECT id FROM tasks WHERE client_id=?)",[id,id]);
    await c.execute("DELETE FROM reviews WHERE reviewer_id=? OR reviewee_id=? OR task_id IN (SELECT id FROM tasks WHERE client_id=?)",[id,id,id]);
    await c.execute("DELETE FROM reports WHERE reporter_id=? OR task_id IN (SELECT id FROM tasks WHERE client_id=?)",[id,id]);
    await c.execute("DELETE FROM deposits WHERE client_id=? OR task_id IN (SELECT id FROM tasks WHERE client_id=?)",[id,id]);
    await c.execute("DELETE FROM bids WHERE freelancer_id=? OR task_id IN (SELECT id FROM tasks WHERE client_id=?)",[id,id]);
    await c.execute("DELETE FROM tasks WHERE client_id=?",[id]);
    await c.execute("DELETE FROM notifications WHERE user_id=?",[id]);
    await c.execute("DELETE FROM freelancer_profiles WHERE user_id=?",[id]);
    await c.execute("DELETE FROM user_profiles WHERE user_id=?",[id]);
    await c.execute("DELETE FROM user_consents WHERE user_id=?",[id]);
    const [deleted]=await c.execute("DELETE FROM users WHERE id=? AND role NOT IN ('admin','moderator')",[id]);
    if(!(deleted as any).affectedRows)throw new Error("Account deletion did not complete");
    await c.commit();
   }catch(e){await c.rollback();throw e;}finally{c.release();}
   return NextResponse.json({ok:true,deleted:true});
  }
  if(b.action==="escrow_settings"){
   const provider=String(b.provider||"unicrow"),network=String(b.network||"base-sepolia"),token=String(b.token||"USDC"),maxHoldDays=b.maxHoldDays===null||b.maxHoldDays===""?null:Number(b.maxHoldDays);
   const commissionBps=Number(b.commissionBps??100);
   let platformWalletAddress="";
   try{platformWalletAddress=getAddress(String(b.platformWalletAddress||""));}catch{return NextResponse.json({error:"عنوان محفظة العمولة غير صالح."},{status:400});}
   if(!["unicrow"].includes(provider)||!["base-sepolia","base"].includes(network)||token!=="USDC"||!Number.isInteger(commissionBps)||commissionBps<0||commissionBps>1000||(commissionBps>0&&!platformWalletAddress)||(maxHoldDays!==null&&(!Number.isInteger(maxHoldDays)||maxHoldDays<1||maxHoldDays>365)))return NextResponse.json({error:"Invalid escrow settings"},{status:400});
   await db().execute("UPDATE escrow_settings SET provider=?,network=?,token=?,max_hold_days=?,commission_bps=?,platform_wallet_address=? WHERE id=1",[provider,network,token,maxHoldDays,commissionBps,platformWalletAddress||null]);
   return NextResponse.json({ok:true,commissionBps,platformWalletAddress,network});
  }
  if(b.action==="report_status"){const id=String(b.reportId||""),status=String(b.status||"");if(!id||!["open","reviewing","resolved","dismissed"].includes(status))return NextResponse.json({error:"Invalid report status"},{status:400});await db().execute("UPDATE reports SET status=? WHERE id=?",[status,id]);return NextResponse.json({ok:true});}
  if(b.action==="ticket_status"){const id=String(b.ticketId||""),status=String(b.status||"");if(!id||!["open","waiting_user","waiting_support","resolved","closed"].includes(status))return NextResponse.json({error:"Invalid ticket status"},{status:400});await db().execute("UPDATE support_tickets SET status=? WHERE id=?",[status,id]);return NextResponse.json({ok:true});}
  return NextResponse.json({error:"Unknown action"},{status:400});
 }catch{return NextResponse.json({error:"Could not apply change."},{status:503});}
}