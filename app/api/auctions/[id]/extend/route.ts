import {NextResponse} from "next/server";
import {getSession} from "@/lib/session";
import {db} from "@/lib/db";
import {ensureAdminSchema} from "@/lib/admin-schema";
export const runtime="nodejs";
export const dynamic="force-dynamic";

const ALLOWED_MINUTES=[1,2,5,10,15,30];
const MAX_EXTENSIONS=10;

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  const session=await getSession();
  if(!session?.sub)return NextResponse.json({error:"سجّل الدخول أولاً."},{status:401});
  const {id}=await params;
  let connection:any;
  try{
    await ensureAdminSchema();
    const body=await req.json();
    const minutes=Number(body.minutes);
    if(!ALLOWED_MINUTES.includes(minutes)){
      return NextResponse.json({error:"مدة التمديد غير صالحة."},{status:400});
    }

    connection=await db().getConnection();
    await connection.beginTransaction();

    // Lock the auction row so two rapid clicks cannot exceed the extension limit.
    const [rows]=await connection.execute(
      "SELECT client_id,status,(auction_ends_at>UTC_TIMESTAMP()) AS still_live FROM tasks WHERE id=? FOR UPDATE",
      [id]
    );
    const auction=(rows as any[])[0];
    if(!auction){
      await connection.rollback();
      return NextResponse.json({error:"المزاد غير موجود."},{status:404});
    }
    if(auction.client_id!==String(session.sub)){
      await connection.rollback();
      return NextResponse.json({error:"التمديد متاح لصاحب المزاد فقط."},{status:403});
    }
    if(auction.status!=="live"||!Number(auction.still_live)){
      await connection.rollback();
      return NextResponse.json({error:"لا يمكن تمديد مزاد انتهى أو أُغلق."},{status:409});
    }

    const [countRows]=await connection.execute(
      "SELECT COUNT(*) AS total FROM task_extensions WHERE task_id=?",
      [id]
    );
    const used=Number((countRows as any[])[0].total||0);
    if(used>=MAX_EXTENSIONS){
      await connection.rollback();
      return NextResponse.json({error:"وصل المزاد إلى الحد الأقصى وهو 10 تمديدات."},{status:409});
    }

    await connection.execute(
      "UPDATE tasks SET auction_ends_at=DATE_ADD(auction_ends_at,INTERVAL ? MINUTE) WHERE id=? AND status='live'",
      [minutes,id]
    );
    await connection.execute(
      "INSERT INTO task_extensions(task_id,actor_id,minutes_added) VALUES(?,?,?)",
      [id,String(session.sub),minutes]
    );
    await connection.execute(
      "INSERT INTO task_events(task_id,actor_id,event_type,payload) VALUES(?,?,?,?)",
      [id,String(session.sub),"auction_extended",JSON.stringify({minutes,extensionNumber:used+1})]
    );
    const [endRows]=await connection.execute(
      "SELECT UNIX_TIMESTAMP(auction_ends_at)*1000 AS ends_ms,auction_ends_at FROM tasks WHERE id=?",
      [id]
    );
    const end=(endRows as any[])[0];
    await connection.commit();
    return NextResponse.json({
      ok:true,
      minutesAdded:minutes,
      extensionsUsed:used+1,
      extensionsRemaining:MAX_EXTENSIONS-used-1,
      auction_ends_at_ms:Number(end.ends_ms),
      auction_ends_at:end.auction_ends_at
    });
  }catch(error){
    if(connection)try{await connection.rollback();}catch{}
    console.error("auction_extend_failed",error);
    return NextResponse.json({error:"تعذر تمديد المزاد. حاول مرة أخرى."},{status:500});
  }finally{
    if(connection)connection.release();
  }
}