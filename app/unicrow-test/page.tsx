import UnicrowDirectTest from "@/components/UnicrowDirectTest";

export const metadata = { title: "اختبار Unicrow | BidRush" };

export default function UnicrowTestPage() {
  return <main dir="rtl" style={{ maxWidth: 820, margin: "32px auto", padding: 20 }}>
    <a href="/dashboard" style={{ color: "#d97706" }}>العودة إلى المنصة</a>
    <h1 style={{ fontSize: 30, fontWeight: 900, marginTop: 18 }}>اختبار Unicrow المباشر</h1>
    <p style={{ color: "#64748b", lineHeight: 1.9 }}>صفحة اختبار مستقلة تستخدم SDK الرسمي لـ Unicrow على Base Sepolia، دون الحاجة إلى إنشاء مزاد داخل BidRush.</p>
    <UnicrowDirectTest />
  </main>;
}
