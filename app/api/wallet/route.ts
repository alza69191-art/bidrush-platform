import { NextResponse } from "next/server";
import { getAddress } from "ethers";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { ensureAdminSchema } from "@/lib/admin-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.sub) return NextResponse.json({ error: "سجّل الدخول." }, { status: 401 });
  try {
    await ensureAdminSchema();
    const [rows] = await db().execute("SELECT wallet_address FROM users WHERE id=? LIMIT 1", [String(session.sub)]);
    return NextResponse.json({ walletAddress: (rows as any[])[0]?.wallet_address || null });
  } catch {
    return NextResponse.json({ error: "تعذر قراءة عنوان المحفظة." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.sub) return NextResponse.json({ error: "سجّل الدخول." }, { status: 401 });
  try {
    const body = await req.json();
    const raw = String(body.address || "");
    let address: string;
    try { address = getAddress(raw); } catch { return NextResponse.json({ error: "عنوان المحفظة غير صالح." }, { status: 400 }); }
    await ensureAdminSchema();
    await db().execute("UPDATE users SET wallet_address=? WHERE id=?", [address, String(session.sub)]);
    return NextResponse.json({ ok: true, walletAddress: address });
  } catch {
    return NextResponse.json({ error: "تعذر حفظ عنوان المحفظة." }, { status: 500 });
  }
}
