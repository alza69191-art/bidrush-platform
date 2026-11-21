import WalletTestPanel from "@/components/WalletTestPanel";
export const metadata = { title: "اختبار المحفظة | BidRush" };
export default function WalletTestPage() {
  return <main dir="rtl" style={{maxWidth:760,margin:"40px auto",padding:24}}>
    <a href="/dashboard" style={{color:"#d97706"}}>العودة إلى المنصة</a>
    <h1 style={{fontSize:30,fontWeight:800,marginTop:18}}>اختبار محفظة Rabby</h1>
    <p style={{color:"#64748b",lineHeight:1.9}}>مرحلة اختبار الاتصال فقط. لن نطلب عبارة الاسترداد أو المفتاح الخاص، ولن ننفذ أي تحويل أو معاملة.</p>
    <WalletTestPanel />
  </main>;
}