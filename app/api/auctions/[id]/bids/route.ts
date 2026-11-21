import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {db} from "@/lib/db";
import {getSession} from "@/lib/session";
import {ensureAdminSchema} from "@/lib/admin-schema";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(_r:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  try{
    await ensureAdminSchema();
    const [rows]=await db().execute(
      "SELECT b.id,b.freelancer_id,b.amount,b.note,b.created_at,u.display_name AS freelancer_name,u.wallet_address AS freelancer_wallet FROM bids b JOIN users u ON u.id=b.freelancer_id WHERE b.task_id=? ORDER BY b.amount ASC,b.created_at ASC",
      [id]
    );
    return NextResponse.json({bids:rows});
  }catch{
    return NextResponse.json({error:"تعذر تحميل العروض."},{status:500});
  }
}

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  const session=await getSession();
  if(!session?.sub)return NextResponse.json({error:"سجّل الدخول."},{status:401});
  if(session.role!=="freelancer")return NextResponse.json({error:"العروض لحسابات المستقلين فقط."},{status:403});

  const {id}=await params;
  let connection:any;

  try{
    const body=await req.json();
    const rawAmount=body.amount;
    const amount=Number(rawAmount);
    const note=String(body.note||"").trim();
    const amountCents=Math.round(amount*100);

    // All supported marketplace currencies use two decimal places.
    if(!Number.isFinite(amount)||!Number.isSafeInteger(amountCents)||amountCents<=0||
       Math.abs(amount*100-amountCents)>1e-7||note.length>500){
      return NextResponse.json({error:"السعر يجب أن يكون موجباً وبحد أقصى منزلتين عشريتين."},{status:400});
    }

    connection=await db().getConnection();
    await connection.beginTransaction();

    const [taskRows]=await connection.execute(
      "SELECT client_id,max_budget,currency,status,(auction_ends_at>UTC_TIMESTAMP()) AS still_live FROM tasks WHERE id=? FOR UPDATE",
      [id]
    );
    const task=(taskRows as any[])[0];

    if(!task||task.status!=="live"||Number(task.still_live)!==1){
      await connection.rollback();
      return NextResponse.json({error:"المزاد منتهٍ أو غير متاح."},{status:409});
    }
    if(String(task.client_id)===String(session.sub)){
      await connection.rollback();
      return NextResponse.json({error:"لا يمكنك المزايدة على مزادك."},{status:403});
    }

    const [existingRows]=await connection.execute(
      "SELECT id FROM bids WHERE task_id=? AND freelancer_id=? LIMIT 1",
      [id,String(session.sub)]
    );
    if((existingRows as any[]).length){
      await connection.rollback();
      return NextResponse.json({error:"لديك عرض سابق على هذا المزاد."},{status:409});
    }

    const [bestRows]=await connection.execute(
      "SELECT MIN(amount) AS amount FROM bids WHERE task_id=?",
      [id]
    );
    const currentAmount=(bestRows as any[])[0].amount;
    const currentCents=Math.round(Number(currentAmount??task.max_budget)*100);

    // Requiring a one-cent minimum decrement avoids DECIMAL(12,2) rounding collisions.
    if(amountCents>=currentCents){
      await connection.rollback();
      return NextResponse.json({error:"يجب أن يكون السعر أقل من أفضل عرض أو الميزانية بمقدار سنت واحد على الأقل."},{status:409});
    }

    const bidId=randomUUID();
    await connection.execute(
      "INSERT INTO bids(id,task_id,freelancer_id,amount,note) VALUES(?,?,?,?,?)",
      [bidId,id,String(session.sub),amountCents/100,note||null]
    );
    await connection.execute(
      "INSERT INTO notifications(id,user_id,type,title,body,href) VALUES(?,?,?,?,?,?)",
      [randomUUID(),task.client_id,"new_bid","وصل عرض جديد","وصل عرض بقيمة "+(amountCents/100).toFixed(2)+" "+task.currency,"/auctions/"+id]
    );
    await connection.execute(
      "INSERT INTO task_events(task_id,actor_id,event_type,payload) VALUES(?,?,?,?)",
      [id,String(session.sub),"bid_submitted",JSON.stringify({bidId,amount:amountCents/100})]
    );

    await connection.commit();
    return NextResponse.json({ok:true,bidId},{status:201});
  }catch(error){
    if(connection)await connection.rollback().catch(()=>{});
    console.error("bid_submit_failed",error);
    return NextResponse.json({error:"تعذر إرسال العرض."},{status:500});
  }finally{
    if(connection)connection.release();
  }
}
