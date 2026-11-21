import { NextResponse } from "next/server";
import { Contract, Interface, JsonRpcProvider, getAddress, parseUnits } from "ethers";
import { Unicrow__factory, UnicrowClaim__factory } from "@unicrowio/ethers-types";
import { randomUUID } from "node:crypto";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { ensureAdminSchema } from "@/lib/admin-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAIN_ID = 84532;
const RPC = "https://sepolia.base.org";
const UNICROW = "0x32fab9f28724c1c5832d5d6830afe498f8abdaac";
const CLAIM = "0x01d612617028f14db6c6f4c00b2a9b4107a90f7a";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const ERC20_EVENTS = new Interface(["event Transfer(address indexed from,address indexed to,uint256 value)"]);

async function loadEscrow(taskId: string) {
  const [rows] = await db().execute(
    "SELECT e.*,t.title,t.currency AS task_currency FROM escrow_transactions e JOIN tasks t ON t.id=e.task_id WHERE e.task_id=? LIMIT 1",
    [taskId],
  );
  return (rows as any[])[0] || null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.sub) return NextResponse.json({ error: "سجّل الدخول." }, { status: 401 });
  const { id } = await params;
  try {
    await ensureAdminSchema();
    const row = await loadEscrow(id);
    if (!row || (String(row.client_id) !== String(session.sub) && String(row.freelancer_id) !== String(session.sub))) {
      return NextResponse.json({ escrow: null });
    }
    let challengePeriodEnd: number | null = null;
    let onchainClaimed = false;
    if (row.provider_reference !== null && row.provider_reference !== undefined) {
      const readProvider = new JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
      try {
        const contract = new Contract(UNICROW, Unicrow__factory.abi, readProvider);
        const data = await contract.getAllEscrowData(String(row.provider_reference));
        challengePeriodEnd = Number(data.escrow.challengePeriodEnd);
        onchainClaimed = Number(data.escrow.claimed) !== 0;
      } finally { await readProvider.destroy(); }
    }
    return NextResponse.json({
      escrow: {
        id: row.id, taskId: row.task_id, amount: String(row.amount), currency: row.currency,
        status: row.status, network: row.network, token: row.token, providerReference: row.provider_reference,
        depositTxHash: row.deposit_tx_hash, releaseTxHash: row.release_tx_hash, claimTxHash: row.claim_tx_hash,
        buyerWallet: row.buyer_wallet, sellerWallet: row.seller_wallet,
        client: String(row.client_id) === String(session.sub),
        challengePeriodSeconds: Number(row.challenge_period_seconds || 259200),
        challengePeriodEnd, onchainClaimed,
      },
    });
  } catch {
    return NextResponse.json({ error: "تعذر تحميل بيانات الوساطة." }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.sub) return NextResponse.json({ error: "سجّل الدخول." }, { status: 401 });
  const { id: taskId } = await params;
  let connection: any;
  const provider = new JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
  try {
    await ensureAdminSchema();
    const body = await req.json();
    const action = String(body.action || "");
    const txHash = String(body.txHash || "");
    const escrowId = Number(body.escrowId);
    if (!["fund", "release", "claim"].includes(action) || !/^0x[0-9a-fA-F]{64}$/.test(txHash) || !Number.isSafeInteger(escrowId) || escrowId < 0) {
      return NextResponse.json({ error: "بيانات تأكيد المعاملة غير صالحة." }, { status: 400 });
    }

    const row = await loadEscrow(taskId);
    if (!row) return NextResponse.json({ error: "سجل الوساطة غير موجود." }, { status: 404 });
    const isClient = String(row.client_id) === String(session.sub);
    const isSeller = String(row.freelancer_id) === String(session.sub);
    if ((action === "fund" || action === "release") && !isClient) return NextResponse.json({ error: "هذه العملية متاحة لصاحب المهمة فقط." }, { status: 403 });
    if (action === "claim" && !isSeller) return NextResponse.json({ error: "المطالبة متاحة للمستقل المستفيد فقط." }, { status: 403 });
    if (row.network !== "base-sepolia" || row.provider !== "unicrow" || String(row.token).toUpperCase() !== "USDC") {
      return NextResponse.json({ error: "إعدادات الشبكة أو مزود الوساطة لا تطابق بيئة الاختبار." }, { status: 409 });
    }
    if (!row.buyer_wallet || !row.seller_wallet) return NextResponse.json({ error: "يجب ربط محفظتي العميل والمستقل والتحقق منهما أولاً." }, { status: 409 });

    const network = await provider.getNetwork();
    if (Number(network.chainId) !== CHAIN_ID) return NextResponse.json({ error: "مزود الشبكة ليس Base Sepolia." }, { status: 503 });
    const receipt = await provider.getTransactionReceipt(txHash);
    const tx = await provider.getTransaction(txHash);
    if (!receipt || !tx || receipt.status !== 1) return NextResponse.json({ error: "المعاملة غير مؤكدة أو فشلت على الشبكة." }, { status: 409 });

    const expectedFrom = getAddress(action === "claim" ? row.seller_wallet : row.buyer_wallet);
    if (getAddress(tx.from) !== expectedFrom) return NextResponse.json({ error: "مرسل المعاملة لا يطابق المحفظة الموثقة لصاحب العملية." }, { status: 403 });

    const unicrow = new Contract(UNICROW, Unicrow__factory.abi, provider);
    const claimContract = new Contract(CLAIM, UnicrowClaim__factory.abi, provider);
    let eventFound = false;
    let sellerUsdcReceived = BigInt(0);
    const configuredClaim = getAddress(await unicrow.unicrowClaim());
    if (configuredClaim !== getAddress(CLAIM)) return NextResponse.json({ error: "عنوان عقد Claim لا يطابق عنوان Unicrow المنشور." }, { status: 503 });
    const expectedTo = action === "claim" ? configuredClaim : UNICROW;
    if (!tx.to || getAddress(tx.to) !== getAddress(expectedTo)) return NextResponse.json({ error: "وجهة المعاملة لا تطابق عقد Unicrow المتوقع." }, { status: 409 });

    for (const log of receipt.logs) {
      if (action === "claim" && getAddress(log.address) === getAddress(USDC)) {
        try { const transfer = ERC20_EVENTS.parseLog({ topics: [...log.topics], data: log.data }); if (transfer?.name === "Transfer" && getAddress(transfer.args.to) === getAddress(row.seller_wallet)) sellerUsdcReceived += transfer.args.value as bigint; } catch {}
      }
      if (getAddress(log.address) !== getAddress(expectedTo)) continue;
      try {
        const parsed = (action === "claim" ? claimContract.interface : unicrow.interface).parseLog({ topics: [...log.topics], data: log.data });
        if (!parsed) continue;
        if (action === "fund" && parsed.name === "Pay" && Number(parsed.args.escrowId) === escrowId) eventFound = true;
        if (action === "release" && parsed.name === "Release" && Number(parsed.args.escrowId) === escrowId) eventFound = true;
        if (action === "claim" && parsed.name === "Claim" && Number(parsed.args[0]?.escrowId ?? parsed.args.escrowId) === escrowId) eventFound = true;
      } catch { /* Ignore logs from unrelated events. */ }
    }
    if (!eventFound) return NextResponse.json({ error: "لم نعثر على حدث Unicrow المطابق داخل إيصال المعاملة." }, { status: 409 });
    if (action === "claim" && sellerUsdcReceived <= BigInt(0)) return NextResponse.json({ error: "تم العثور على حدث المطالبة لكن إيصال المعاملة لا يثبت تحويل USDC إلى محفظة المستقل." }, { status: 409 });

    const chainData = await unicrow.getAllEscrowData(escrowId);
    const onchain = chainData.escrow;
    const latestBlock = await provider.getBlock("latest");
    if (!latestBlock) return NextResponse.json({ error: "تعذر قراءة وقت آخر كتلة من الشبكة." }, { status: 503 });
    if (action === "claim" && latestBlock.timestamp < Number(onchain.challengePeriodEnd)) return NextResponse.json({ error: "لم تنتهِ فترة الاعتراض على الشبكة بعد؛ لا يمكن المطالبة قبل موعدها." }, { status: 409 });
    if (action === "claim" && Number(onchain.claimed) === 0) return NextResponse.json({ error: "العقد لم يسجل الضمان كمطالب به بعد." }, { status: 409 });
    if (Number(onchain.challengePeriodEnd) - Number(onchain.challengePeriodStart) !== Number(row.challenge_period_seconds)) return NextResponse.json({ error: "مدة الاعتراض في العقد لا تطابق المدة المسجلة في BidRush." }, { status: 409 });
    if (getAddress(onchain.buyer) !== getAddress(row.buyer_wallet) ||
        getAddress(onchain.seller) !== getAddress(row.seller_wallet) ||
        getAddress(onchain.currency) !== getAddress(USDC) ||
        getAddress(chainData.token.address_) !== getAddress(USDC) ||
        Number(chainData.token.decimals) !== 6 || String(chainData.token.symbol) !== "USDC" ||
        onchain.amount !== parseUnits(String(row.amount), 6) ||
        onchain.paymentReference !== String(taskId)) {
      return NextResponse.json({ error: "بيانات الضمان على الشبكة لا تطابق المهمة والمبلغ والمحافظ والرمز في BidRush." }, { status: 409 });
    }

    if (action === "fund" && row.status !== "awaiting_funding") {
      if (row.status === "funded" && row.deposit_tx_hash === txHash && String(row.provider_reference) === String(escrowId)) {
        return NextResponse.json({ ok: true, idempotent: true, status: row.status });
      }
      return NextResponse.json({ error: "حالة سجل الوساطة لا تسمح بتأكيد تمويل جديد." }, { status: 409 });
    }
    if (action === "release" && row.status !== "work_submitted") {
      if (row.status === "released" && row.release_tx_hash === txHash) return NextResponse.json({ ok: true, idempotent: true, status: row.status });
      return NextResponse.json({ error: "لا يمكن تحرير الضمان قبل تسليم العمل أو بعد تغيير حالته." }, { status: 409 });
    }
    if (action === "claim" && row.status !== "released") {
      if (row.status === "released" && row.claim_tx_hash === txHash) return NextResponse.json({ ok: true, idempotent: true, status: row.status });
      return NextResponse.json({ error: "لا يمكن المطالبة قبل تأكيد تحرير الضمان." }, { status: 409 });
    }

    connection = await db().getConnection();
    await connection.beginTransaction();
    const [lockedRows] = await connection.execute("SELECT status,deposit_tx_hash,release_tx_hash,claim_tx_hash FROM escrow_transactions WHERE id=? FOR UPDATE", [row.id]);
    const locked = (lockedRows as any[])[0];
    if (!locked) throw new Error("سجل الوساطة غير موجود.");
    if (action === "claim" && locked.claim_tx_hash) {
      if (locked.claim_tx_hash === txHash) { await connection.rollback(); return NextResponse.json({ ok: true, idempotent: true, status: locked.status }); }
      throw new Error("تم تسجيل مطالبة سابقة لهذا الضمان.");
    }
    if (action === "fund") {
      if (locked.status !== "awaiting_funding") throw new Error("تغيرت حالة الضمان أثناء التحقق.");
      await connection.execute("UPDATE escrow_transactions SET status='funded',provider_reference=?,deposit_tx_hash=?,funded_at=UTC_TIMESTAMP(),hold_started_at=UTC_TIMESTAMP() WHERE id=?", [String(escrowId), txHash, row.id]);
    } else if (action === "release") {
      if (locked.status !== "work_submitted") throw new Error("تغيرت حالة الضمان أثناء التحقق.");
      await connection.execute("UPDATE escrow_transactions SET status='released',release_tx_hash=?,released_at=UTC_TIMESTAMP() WHERE id=?", [txHash, row.id]);
    } else {
      if (locked.status !== "released") throw new Error("تغيرت حالة الضمان أثناء التحقق.");
      if (locked.claim_tx_hash && locked.claim_tx_hash !== txHash) throw new Error("تم تسجيل مطالبة سابقة لهذا الضمان.");
      await connection.execute("UPDATE escrow_transactions SET claim_tx_hash=? WHERE id=?", [txHash, row.id]);
    }
    await connection.execute("INSERT INTO escrow_events(id,escrow_id,actor_id,event_type,description,metadata) VALUES(?,?,?,?,?,?)", [
      randomUUID(), row.id, String(session.sub), action === "fund" ? "onchain_funded" : action === "release" ? "onchain_released" : "onchain_claimed",
      action === "fund" ? "تم التحقق من حدث Pay وبيانات الضمان على Base Sepolia." : action === "release" ? "تم التحقق من حدث Release على Base Sepolia." : "تم التحقق من حدث Claim على Base Sepolia.",
      JSON.stringify({ txHash, chainId: CHAIN_ID, escrowId }),
    ]);
    const notifyUser = action === "fund" ? row.freelancer_id : action === "release" ? row.freelancer_id : row.client_id;
    await connection.execute("INSERT INTO notifications(id,user_id,type,title,body,href) VALUES(?,?,?,?,?,?)", [
      randomUUID(), notifyUser, "escrow_" + action,
      action === "fund" ? "تم تأكيد تمويل الضمان" : action === "release" ? "تم تأكيد تحرير الضمان" : "تم تأكيد المطالبة بالمبلغ",
      action === "fund" ? "تحقق BidRush من معاملة USDC التجريبية وبيانات عقد Unicrow." : action === "release" ? "تحقق BidRush من معاملة تحرير الضمان على الشبكة." : "تحقق BidRush من معاملة مطالبة المستفيد على الشبكة.",
      "/auctions/" + taskId,
    ]);
    await connection.commit();
    return NextResponse.json({ ok: true, action, status: action === "fund" ? "funded" : "released", txHash, escrowId });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error("escrow_chain_verification_failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر التحقق من معاملة الوساطة." }, { status: 500 });
  } finally {
    if (connection) connection.release();
    await provider.destroy();
  }
}
