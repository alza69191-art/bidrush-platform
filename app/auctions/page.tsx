import Link from "next/link";
import WorkspaceShell from "@/components/WorkspaceShell";
import AuctionExpiryGuard from "@/components/AuctionExpiryGuard";
import {db} from "@/lib/db";
export const dynamic="force-dynamic";
export default async function Auctions(){
 let rows:any[]=[];
 try{
  await db().execute("UPDATE tasks SET status='expired' WHERE status='live' AND auction_ends_at<=UTC_TIMESTAMP()");
  const [r]=await db().query("SELECT t.id,t.title,t.description,t.category,t.currency,t.max_budget,t.auction_ends_at,UNIX_TIMESTAMP(t.auction_ends_at)*1000 AS auction_ends_at_ms,(t.image_key IS NOT NULL OR t.image_data IS NOT NULL) AS has_image,u.display_name AS client_name,(SELECT COUNT(*) FROM bids b WHERE b.task_id=t.id) AS bids_count,(SELECT MIN(amount) FROM bids b WHERE b.task_id=t.id) AS best_bid FROM tasks t JOIN users u ON u.id=t.client_id WHERE t.status='live' AND t.auction_ends_at>UTC_TIMESTAMP() ORDER BY t.auction_ends_at ASC LIMIT 100");
  rows=r as any[];
 }catch(e){console.error("auction_cards_load_failed",e);}
 return <WorkspaceShell>
  <div className="page-heading auction-page-heading">
   <span className="eyebrow">فرص حقيقية من قاعدة البيانات</span>
   <h1>المزادات والمناقصات المباشرة</h1>
   <p>استعرض المناقصات، قارن العروض، وقدّم عرضك المناسب قبل انتهاء الوقت.</p>
  </div>
  <div className="auction-grid">
   {rows.map(t=><AuctionExpiryGuard key={t.id} endsAt={t.auction_ends_at_ms}><article className="auction-tile">
    <h2 className="auction-tile-title">{t.title}</h2>
    {t.has_image?<Link href={"/auctions/"+t.id} className="auction-tile-image-link"><img className="auction-tile-image" src={"/api/auctions/"+t.id+"/image"} alt={t.title}/></Link>:<Link href={"/auctions/"+t.id} className="auction-tile-image-placeholder"><span>BidRush</span><small>لا توجد صورة مرفقة</small></Link>}
    <div className="auction-tile-body">
     <div className="auction-tile-meta"><span className="tag">{t.category}</span><span className="auction-live-label"><i/> مباشر</span></div>
     <p className="auction-tile-description">{t.description.slice(0,190)}{t.description.length>190?"…":""}</p>
     <div className="auction-tile-facts">
      <div><small>الميزانية القصوى</small><b>{t.max_budget} {t.currency}</b></div>
      <div><small>أفضل عرض</small><b>{t.best_bid?t.best_bid+" "+t.currency:"بانتظار العروض"}</b></div>
     </div>
     <div className="auction-tile-footer"><small>بواسطة {t.client_name} · {t.bids_count} عروض</small></div>
     <div className="auction-tile-actions">
      <Link className="btn btn-outline btn-small" href={"/auctions/"+t.id+"#offers"}>العروض ({t.bids_count})</Link>
      <Link className="btn btn-primary btn-small" href={"/auctions/"+t.id+"#send-offer"}>إرسال عرض</Link>
     </div>
    </div>
   </article></AuctionExpiryGuard>)}
   {!rows.length&&<div className="empty-state auction-empty">لا توجد مناقصات نشطة حالياً.<Link href="/auctions/new" className="btn btn-primary">أنشئ مناقصة جديدة</Link></div>}
  </div>
 </WorkspaceShell>;
}
