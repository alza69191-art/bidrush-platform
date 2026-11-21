import {NextResponse} from "next/server";
import {getSession} from "@/lib/session";
import {db} from "@/lib/db";
import {randomUUID} from "node:crypto";
import {ensureAdminSchema} from "@/lib/admin-schema";

export const runtime="nodejs";

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  const session=await getSession();
  if(!session?.sub)return NextResponse.json({error:"سجّل الدخول."},{status:401});

  const {id}=await params;
  let connection:any;

  try{
    await ensureAdminSchema();
    const body=await req.json();
    const bidId=String(body.bidId||"");
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bidId)){
      return NextResponse.json({error:"معرّف العرض غير صالح."},{status:400});
    }

    connection=await db().getConnection();
    await connection.beginTransaction();

    const [taskRows]=await connection.execute(
      "SELECT t.client_id,t.status,t.currency,(t.auction_ends_at<=UTC_TIMESTAMP()) AS auction_expired,u.wallet_address AS client_wallet FROM tasks t JOIN users u ON u.id=t.client_id WHERE t.id=? FOR UPDATE",
      [id]
    );
    const task=(taskRows as any[])[0];

    if(!task){
      await connection.rollback();
      return NextResponse.json({error:"المزاد غير موجود."},{status:404});
    }
    if(String(task.client_id)!==String(session.sub)){
      await connection.rollback();
      return NextResponse.json({error:"اختيار الفائز متاح لصاحب المزاد فقط."},{status:403});
    }
    if(task.status!=="live"){
      await connection.rollback();
      return NextResponse.json({error:"المزاد لم يعد مفتوحاً."},{status:409});
    }
    if(Number(task.auction_expired)===1){
      await connection.execute("UPDATE tasks SET status='expired' WHERE id=? AND status='live'",[id]);
      await connection.commit();
      return NextResponse.json({error:"انتهى وقت المزاد؛ لا يمكن اختيار عرض بعد انتهائه."},{status:409});
    }

    if(!task.client_wallet){
      await connection.rollback();
      return NextResponse.json({error:"يجب ربط محفظة Rabby والتحقق من ملكيتها قبل اختيار العرض."},{status:409});
    }

    const [bidRows]=await connection.execute(
      "SELECT b.id,b.freelancer_id,b.amount,u.wallet_address AS freelancer_wallet FROM bids b JOIN users u ON u.id=b.freelancer_id WHERE b.id=? AND b.task_id=? FOR UPDATE",
      [bidId,id]
    );
    const bid=(bidRows as any[])[0];
    if(!bid){
      await connection.rollback();
      return NextResponse.json({error:"العرض غير موجود في هذا المزاد."},{status:404});
    }
    if(!bid.freelancer_wallet){
      await connection.rollback();
      return NextResponse.json({error:"يجب على المستقل ربط محفظة Rabby والتحقق من ملكيتها قبل اختياره."},{status:409});
    }
    if(String(bid.freelancer_id)===String(task.client_id)){
      await connection.rollback();
      return NextResponse.json({error:"لا يمكن اختيار عرض صاحب المزاد نفسه."},{status:409});
    }

    const [settingsRows]=await connection.execute(
      "SELECT provider,network,token FROM escrow_settings WHERE id=1 FOR UPDATE"
    );
    const settings=(settingsRows as any[])[0]||{provider:"unicrow",network:"base-sepolia",token:"USDC"};

    // Platform and arbitrator fees remain zero until testnet end-to-end tests pass.
    const commissionBps=0;
    const commissionAmount=0;
    const escrowId=randomUUID();

    await connection.execute(
      "UPDATE tasks SET winner_bid_id=?,status='awarded' WHERE id=? AND status='live'",
      [bid.id,id]
    );
    await connection.execute(
      "INSERT INTO escrow_transactions(id,task_id,bid_id,client_id,freelancer_id,amount,currency,commission_bps,commission_amount,provider,network,token,buyer_wallet,seller_wallet,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'awaiting_funding')",
      [escrowId,id,bid.id,String(task.client_id),String(bid.freelancer_id),Number(bid.amount),String(task.currency||"USD"),commissionBps,commissionAmount,String(settings.provider||"unicrow"),String(settings.network||"base-sepolia"),String(settings.token||"USDC"),String(task.client_wallet),String(bid.freelancer_wallet)]
    );
    await connection.execute(
      "INSERT INTO escrow_events(id,escrow_id,actor_id,event_type,description,metadata) VALUES(?,?,?,'escrow_created',?,?)",
      [randomUUID(),escrowId,String(session.sub),"تم إنشاء سجل متابعة داخلي بانتظار تمويل الاحتجاز على شبكة الاختبار؛ لم يتم تحويل أي أموال بعد.",JSON.stringify({amount:Number(bid.amount),commissionBps,commissionAmount,network:String(settings.network||"base-sepolia")})]
    );
    await connection.execute(
      "INSERT INTO notifications(id,user_id,type,title,body,href) VALUES(?,?,?,?,?,?)",
      [randomUUID(),bid.freelancer_id,"bid_awarded","تم اختيار عرضك","تم اختيار عرضك. لا يبدأ الاحتجاز المالي إلا بعد تأكيد معاملة Unicrow على الشبكة.", "/auctions/"+id]
    );
    await connection.execute(
      "INSERT INTO task_events(task_id,actor_id,event_type,payload) VALUES(?,?,?,?)",
      [id,String(session.sub),"bid_awarded",JSON.stringify({bidId:bid.id,escrowId})]
    );

    await connection.commit();
    return NextResponse.json({ok:true,escrowId,status:"awaiting_funding",network:String(settings.network||"base-sepolia")});
  }catch(error){
    if(connection)await connection.rollback().catch(()=>{});
    console.error("auction_award_failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"تعذر اختيار العرض."},{status:500});
  }finally{
    if(connection)connection.release();
  }
}
