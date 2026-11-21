import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getAddress, verifyMessage } from "ethers";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { ensureAdminSchema } from "@/lib/admin-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.sub) return NextResponse.json({ error: "سجّل الدخول." }, { status: 401 });
  try {
    await ensureAdminSchema();
    const requestedChainId=Number(new URL(req.url).searchParams.get("chainId")||84532);
    if(![8453,84532].includes(requestedChainId))return NextResponse.json({error:"شبكة المحفظة غير مدعومة."},{status:400});
    const nonce = randomBytes(18).toString("hex");
    await db().execute("UPDATE users SET wallet_nonce=?,wallet_nonce_created_at=UTC_TIMESTAMP() WHERE id=?", [nonce, String(session.sub)]);
    const [rows] = await db().execute("SELECT wallet_address FROM users WHERE id=? LIMIT 1", [String(session.sub)]);
    return NextResponse.json({ nonce, walletAddress: (rows as any[])[0]?.wallet_address || null, chainId: requestedChainId });
  } catch {
    return NextResponse.json({ error: "تعذر إنشاء تحدي التحقق." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.sub) return NextResponse.json({ error: "سجّل الدخول." }, { status: 401 });
  try {
    const body = await req.json();
    const address = getAddress(String(body.address || ""));
    const nonce = String(body.nonce || "");
    const signature = String(body.signature || "");
    const chainId=Number(body.chainId||84532);
    if(![8453,84532].includes(chainId))return NextResponse.json({error:"شبكة المحفظة غير مدعومة."},{status:400});
    if (!/^[a-f0-9]{36}$/.test(nonce) || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
      return NextResponse.json({ error: "بيانات التوقيع غير صالحة." }, { status: 400 });
    }
    await ensureAdminSchema();
    const [rows] = await db().execute(
      "SELECT wallet_nonce FROM users WHERE id=? AND wallet_nonce=? AND wallet_nonce_created_at>=UTC_TIMESTAMP()-INTERVAL 5 MINUTE LIMIT 1",
      [String(session.sub), nonce],
    );
    if (!(rows as any[]).length) return NextResponse.json({ error: "انتهت صلاحية التحدي. أعد المحاولة." }, { status: 409 });
    const message = "BidRush wallet verification\nAddress: " + address + "\nChain ID: " + chainId + "\nNonce: " + nonce;
    const recovered = getAddress(verifyMessage(message, signature));
    if (recovered !== address) return NextResponse.json({ error: "التوقيع لا يثبت ملكية هذا العنوان." }, { status: 403 });
    const [consumeResult] = await db().execute("UPDATE users SET wallet_address=?,wallet_nonce=NULL,wallet_nonce_created_at=NULL WHERE id=? AND wallet_nonce=? AND wallet_nonce_created_at>=UTC_TIMESTAMP()-INTERVAL 5 MINUTE", [address, String(session.sub), nonce]);
    if (Number((consumeResult as any).affectedRows || 0) !== 1) return NextResponse.json({ error: "تم استخدام تحدي التحقق أو انتهت صلاحيته. أعد المحاولة." }, { status: 409 });
    return NextResponse.json({ ok: true, walletAddress: address, chainId });
  } catch (error) {
    if (error instanceof Error && /invalid address/i.test(error.message)) return NextResponse.json({ error: "عنوان المحفظة غير صالح." }, { status: 400 });
    return NextResponse.json({ error: "تعذر التحقق من ملكية المحفظة." }, { status: 500 });
  }
}
