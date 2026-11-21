"use client";

import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, ZeroAddress, getAddress, parseUnits } from "ethers";
import { ERC20__factory, Unicrow__factory, UnicrowClaim__factory } from "@unicrowio/ethers-types";

type Injected = { isRabby?: boolean; request(args: { method: string; params?: unknown[] | object }): Promise<any> };

const NETWORKS = {
  "base-sepolia": { chain: "0x14a34", chainId: 84532, rpc: "https://sepolia.base.org", usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", unicrow: "0x32fab9f28724c1c5832d5d6830afe498f8abdaac", claim: "0x01d612617028f14db6c6f4c00b2a9b4107a90f7a", explorer: "https://sepolia.basescan.org/tx/" },
  "base": { chain: "0x2105", chainId: 8453, rpc: "https://mainnet.base.org", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", unicrow: "0x19EbA0BE87dF312d9041240ddE468507adaC9e0A", claim: "0x063d6472df3FdD1cec9B00cac29bcd935511f451", explorer: "https://basescan.org/tx/" },
} as const;
function networkConfig(network: string) {
  const config = NETWORKS[network as keyof typeof NETWORKS];
  if (!config) throw new Error("شبكة الوساطة غير مدعومة.");
  return config;
}

function injectedWallet() {
  const injected = (window as any).ethereum as (Injected & { providers?: Injected[] }) | undefined;
  const candidates = injected?.providers?.length ? injected.providers : [injected];
  return candidates.find((p) => p?.isRabby) || injected || null;
}

export default function EscrowActions({ taskId, taskStatus }: { taskId: string; taskStatus: string }) {
  const [escrow, setEscrow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/auctions/" + taskId + "/escrow", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "تعذر تحميل بيانات الضمان.");
      setEscrow(d.escrow);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل بيانات الضمان."); }
    finally { setLoading(false); }
  }, [taskId]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);

  async function connectAndVerify() {
    const config = networkConfig(escrow.network);
    const wallet = injectedWallet();
    if (!wallet) throw new Error("افتح محفظة Rabby ثم أعد تحميل الصفحة.");
    const accounts = await wallet.request({ method: "eth_requestAccounts" });
    const address = Array.isArray(accounts) && accounts[0] ? getAddress(accounts[0]) : "";
    if (!address) throw new Error("لم يتم إرجاع عنوان المحفظة.");
    let chainId = String(await wallet.request({ method: "eth_chainId" })).toLowerCase();
    if (chainId !== config.chain) {
      try { await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: config.chain }] }); }
      catch (e: any) {
        if (e?.code !== 4902) throw e;
        await wallet.request({ method: "wallet_addEthereumChain", params: [{ chainId: config.chain, chainName: escrow.network === "base" ? "Base" : "Base Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [config.rpc], blockExplorerUrls: [escrow.network === "base" ? "https://basescan.org" : "https://sepolia.basescan.org"] }] });
        await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: config.chain }] });
      }
      chainId = String(await wallet.request({ method: "eth_chainId" })).toLowerCase();
    }
    if (chainId !== config.chain) throw new Error("يجب الاتصال بشبكة Base المحددة للمزاد.");
    const challengeResponse = await fetch("/api/wallet", { cache: "no-store" });
    const challenge = await challengeResponse.json();
    if (!challengeResponse.ok) throw new Error(challenge.error || "تعذر بدء التحقق.");
    const text = "BidRush wallet verification\nAddress: " + address + "\nChain ID: " + config.chainId + "\nNonce: " + challenge.nonce;
    const hex = "0x" + Array.from(new TextEncoder().encode(text)).map((x) => x.toString(16).padStart(2, "0")).join("");
    const signature = await wallet.request({ method: "personal_sign", params: [hex, address] });
    const save = await fetch("/api/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address, nonce: challenge.nonce, signature }) });
    const saved = await save.json();
    if (!save.ok) throw new Error(saved.error || "تعذر التحقق من المحفظة.");
    return address;
  }

  async function signAction(action: "fund" | "release" | "claim") {
    setBusy(true); setError(""); setMessage("");
    try {
      const config = networkConfig(escrow.network);
      const wallet = injectedWallet();
      if (!wallet) throw new Error("افتح محفظة Rabby ثم أعد تحميل الصفحة.");
      const accounts = await wallet.request({ method: "eth_requestAccounts" });
      const address = Array.isArray(accounts) && accounts[0] ? getAddress(accounts[0]) : "";
      if (!address) throw new Error("لم يتم إرجاع عنوان المحفظة.");
      const chain = String(await wallet.request({ method: "eth_chainId" })).toLowerCase();
      if (chain !== config.chain) throw new Error("حوّل Rabby إلى شبكة Base المحددة لهذا الضمان قبل توقيع المعاملة.");
      const expected = action === "claim" ? escrow.sellerWallet : escrow.buyerWallet;
      if (!expected || address !== getAddress(expected)) {
        const verified = await connectAndVerify();
        if (verified !== getAddress(expected || "0x0000000000000000000000000000000000000000")) throw new Error("المحفظة المتصلة لا تطابق المحفظة التي ثُبّتت في هذا الضمان عند اختيار العرض.");
      }
      const provider = new BrowserProvider(wallet as any);
      const signer = await provider.getSigner();
      const escrowId = Number(escrow.providerReference);

      if (action === "fund") {
        const amount = parseUnits(String(escrow.amount), 6);
        const token = ERC20__factory.connect(config.usdc, signer);
        const [symbol, decimals, balance, allowance] = await Promise.all([token.symbol(), token.decimals(), token.balanceOf(address), token.allowance(address, config.unicrow)]);
        if (symbol !== "USDC" || Number(decimals) !== 6) throw new Error("رمز USDC أو عدد منازله لا يطابق الشبكة المحددة.");
        if (balance < amount) throw new Error("رصيد USDC غير كافٍ على الشبكة المحددة.");
        if (allowance < amount) {
          setMessage("تأكيد موافقة USDC في Rabby...");
          const approval = await token.approve(config.unicrow, amount);
          await approval.wait();
        }
        setMessage("تأكيد إيداع الضمان في Rabby...");
        const unicrow = Unicrow__factory.connect(config.unicrow, signer);
        const tx = await unicrow.pay(address, {
          buyer: address,
          seller: getAddress(escrow.sellerWallet),
          marketplace: escrow.platformWalletAddress ? getAddress(escrow.platformWalletAddress) : ZeroAddress,
          marketplaceFee: Number(escrow.commissionBps || 0),
          currency: config.usdc,
          challengePeriod: escrow.challengePeriodSeconds,
          challengeExtension: 0,
          amount,
          paymentReference: taskId,
        }, ZeroAddress, 0);
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) throw new Error("لم تنجح معاملة إيداع الضمان.");
        let found: number | null = null;
        for (const log of receipt.logs) {
          if (getAddress(log.address) !== getAddress(config.unicrow)) continue;
          try { const parsed = unicrow.interface.parseLog(log); if (parsed?.name === "Pay") found = Number(parsed.args.escrowId); } catch {}
        }
        if (found === null) throw new Error("لم نعثر على حدث Pay في إيصال المعاملة.");
        await verifyWithServer("fund", tx.hash, found);
      } else if (action === "release") {
        setMessage("تأكيد تحرير الضمان في Rabby...");
        const unicrow = Unicrow__factory.connect(config.unicrow, signer);
        const tx = await unicrow.release(escrowId);
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) throw new Error("لم تنجح معاملة تحرير الضمان.");
        await verifyWithServer("release", tx.hash, escrowId);
      } else {
        setMessage("تأكيد المطالبة بالمبلغ في Rabby...");
        const claim = UnicrowClaim__factory.connect(config.claim, signer);
        const tx = await claim.claim(escrowId);
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) throw new Error("لم تنجح معاملة المطالبة.");
        await verifyWithServer("claim", tx.hash, escrowId);
      }
      setMessage("تم تأكيد المعاملة والتحقق منها وتحديث سجل BidRush.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تنفيذ معاملة الوساطة.");
    } finally { setBusy(false); }
  }

  async function verifyWithServer(action: "fund" | "release" | "claim", txHash: string, escrowId: number) {
    const r = await fetch("/api/auctions/" + taskId + "/escrow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, txHash, escrowId }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "لم يتمكن BidRush من التحقق من المعاملة.");
  }

  if (loading) return <div className="notice">جارٍ تحميل حالة الوساطة...</div>;
  if (!escrow) return <div className="notice">لم يتم إنشاء سجل ضمان لهذه المهمة بعد.</div>;
  const isBuyer = escrow.client;
  const challengeEndMs = Number(escrow.challengePeriodEnd || 0) * 1000;
  const claimable = challengeEndMs > 0 && now >= challengeEndMs && !escrow.onchainClaimed;
  const remainingSeconds = challengeEndMs > now ? Math.ceil((challengeEndMs - now) / 1000) : 0;
  const txLinks = [["إيداع", escrow.depositTxHash], ["تحرير", escrow.releaseTxHash], ["مطالبة", escrow.claimTxHash]] as const;

  return <section className="content-card" style={{ marginTop: 18 }}>
    <h2>الوساطة الخارجية عبر Unicrow</h2>
    <p className="muted">عمولة BidRush: {Number(escrow.commissionBps || 0) / 100}% · المبلغ المتوقع: {Number(escrow.commissionAmount || 0).toFixed(2)} USDC · المستلم: <code dir="ltr">{escrow.platformWalletAddress || "غير محدد"}</code></p>
    <p className="muted">{escrow.network === "base" ? "Base Mainnet · USDC حقيقي" : "Base Sepolia · USDC تجريبي"} · Chain ID {networkConfig(escrow.network).chainId}. كل توقيع مالي يتم داخل Rabby.</p>
    <div className="notice">حالة الضمان في BidRush: <b>{escrow.status}</b> · المبلغ: <b>{escrow.amount} USDC</b> · مدة الاعتراض: {Math.ceil(Number(escrow.challengePeriodSeconds || 0) / 86400)} يوم. {challengeEndMs ? (claimable ? "انتهت فترة الاعتراض." : "المتبقي للاعتراض: " + Math.floor(remainingSeconds / 86400) + " يوم و" + Math.floor((remainingSeconds % 86400) / 3600) + " ساعة.") : "سيظهر موعد المطالبة بعد تأكيد التمويل."}</div>
    <p className="muted">محفظة العميل: <code dir="ltr">{escrow.buyerWallet}</code><br/>محفظة المستقل: <code dir="ltr">{escrow.sellerWallet}</code></p>
    {isBuyer && escrow.status === "awaiting_funding" && <button className="btn btn-primary" disabled={busy} onClick={() => signAction("fund")}>{busy ? "جارٍ تنفيذ العملية..." : "تمويل الضمان بـ USDC"}</button>}
    {isBuyer && escrow.status === "work_submitted" && <button className="btn btn-primary" disabled={busy} onClick={() => signAction("release")}>{busy ? "جارٍ تنفيذ العملية..." : "تحرير المبلغ للمستقل"}</button>}
    {!isBuyer && escrow.status === "released" && !escrow.claimTxHash && claimable && <button className="btn btn-primary" disabled={busy} onClick={() => signAction("claim")}>{busy ? "جارٍ تنفيذ العملية..." : "المطالبة بالمبلغ واستلامه"}</button>}
    {escrow.status === "funded" && <p className="notice">تم تأكيد التمويل. يستطيع المستقل تسليم العمل الآن.</p>}
    {!isBuyer && escrow.status === "released" && !escrow.claimTxHash && !claimable && <p className="notice">لا يمكن المطالبة قبل انتهاء فترة الاعتراض المحددة في العقد الذكي.</p>}
    {escrow.status === "released" && escrow.claimTxHash && <p className="notice">تم تحرير الضمان وتأكيد مطالبة المستفيد.</p>}
    {message && <p role="status" className="notice">{message}</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    <div style={{ marginTop: 12, display: "grid", gap: 6 }}>{txLinks.filter(([, hash]) => hash).map(([label, hash]) => <a key={label} href={networkConfig(escrow.network).explorer + hash} target="_blank" rel="noreferrer" className="text-link">{label}: {String(hash).slice(0, 12)}… · BaseScan</a>)}</div>
    <button className="btn btn-outline btn-small" style={{ marginTop: 12 }} disabled={busy} onClick={refresh}>تحديث حالة الضمان</button>
  </section>;
}
