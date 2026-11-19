import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'BidRush — مزادات عكسية بفرص أفضل', description: 'أنجز أعمالك الرقمية بسرعة عبر مزاد عكسي مباشر.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ar" dir="rtl"><body>{children}</body></html>; }
