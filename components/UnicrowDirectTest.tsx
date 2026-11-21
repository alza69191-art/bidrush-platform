"use client";

import { useState } from "react";
import { BrowserProvider, getAddress, isAddress } from "ethers";
import * as Unicrow from "@unicrowio/sdk";

const CHAIN_ID = 84532;
const CHAIN_HEX = "0x14a34";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const EXPLORER = "https://sepolia.basescan.org/tx/";

declare global {
  interface Window {
    ethereum?: { isRabby?: boolean; providers?: Array<any>; request(args: any): Promise<any> };
  }
}

export default function UnicrowDirectTest() {
  const [wallet, setWallet] = useState("");
  const [chain, setChain] = useState("");
  const [seller, setSeller] = useState("");
  const [amount, setAmount] = useState("1");
  const [days, setDays] = useState("1");
  const [reference, setReference] = useState("BidRush-test-" + Date.now().toString().slice(-6));
  const [escrowId, setEscrowId] = useState("");
  const [status, setStatus] = useState("اتصل بالمحفظة لبدء الاختبار.");
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [escrowInfo, setEscrowInfo] = useState<any>(null);

  function getWallet() {
    const eth = window.ethereum;
    const providers = eth?.providers?.length ? eth.providers : [eth];
    return providers.find((p: any) => p?.isRabby) || eth || null;
  }

  async function connect() {
    setBusy(true);
    try {
      const p = getWallet();
      if (!p) throw new Error("لم يتم العثور على Rabby. افتح المحفظة ثم أعد تحميل الصفحة.");
      const accounts = await p.request({ method: "eth_requestAccounts" });
      if (!accounts?.[0]) throw new Error("لم يتم إرجاع عنوان المحفظة.");
      const chainId = String(await p.request({ method: "eth_chainId" })).toLowerCase();
      setWallet(getAddress(accounts[0]));
      setChain(chainId);
      setStatus(chainId === CHAIN_HEX ? "متصل على Base Sepolia. لا توجد أموال حقيقية في هذه الشبكة." : "اتصلت المحفظة. حوّلها إلى Base Sepolia قبل المتابعة.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "تعذر الاتصال بالمحفظة.");
    } finally { setBusy(false); }
  }

  async function switchNetwork() {
    setBusy(true);
    try {
      const p = getWallet();
      if (!p) throw new Error("لم يتم العثور على Rabby.");
      try {
        await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
      } catch (e: any) {
        if (e?.code !== 4902) throw e;
        await p.request({ method: "wallet_addEthereumChain", params: [{ chainId: CHAIN_HEX, chainName: "Base Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://sepolia.base.org"], blockExplorerUrls: ["https://sepolia.basescan.org"] }] });
        await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
      }
      const id = String(await p.request({ method: "eth_chainId" })).toLowerCase();
      setChain(id);
      setStatus(id === CHAIN_HEX ? "تم اختيار Base Sepolia. يمكنك متابعة الاختبار." : "لم يتم تأكيد تغيير الشبكة.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "تعذر تغيير الشبكة.");
    } finally { setBusy(false); }
  }

  async function createEscrow() {
    setBusy(true); setTxHash(""); setEscrowInfo(null);
    try {
      if (!wallet) throw new Error("اتصل بمحفظة Rabby أولاً.");
      if (chain !== CHAIN_HEX) throw new Error("حوّل Rabby إلى Base Sepolia أولاً.");
      if (!isAddress(seller)) throw new Error("أدخل عنوان Ethereum صحيحاً للمستفيد.");
      const n = Number(amount), d = Number(days);
      if (!Number.isFinite(n) || n <= 0 || n > 1000000) throw new Error("أدخل مبلغ USDC صحيحاً.");
      if (!Number.isInteger(d) || d < 1 || d > 30) throw new Error("فترة الاختبار يجب أن تكون بين يوم و30 يوماً.");
      Unicrow.config({ chainId: BigInt(CHAIN_ID), autoSwitchNetwork: false });
      setStatus("سيُفتح نموذج Unicrow. راجع تفاصيل العملية ورسوم الشبكة داخل Rabby قبل أي موافقة.");
      const result: any = await (Unicrow as any).ui.pay({
        seller: getAddress(seller),
        amount: n,
        tokenAddress: USDC,
        challengePeriod: d * 86400,
        marketplaceFee: 0,
        arbitratorFee: 0,
        paymentReference: reference.slice(0, 100),
      });
      setEscrowId(String(result.escrowId));
      setTxHash(result.transactionHash || "");
      setEscrowInfo(result);
      setStatus("أُنشئت عملية الضمان على Base Sepolia. احتفظ برقم الضمان لإجراء اختبار التحرير أو المطالبة لاحقاً.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "تعذر إنشاء الضمان.");
    } finally { setBusy(false); }
  }

  async function loadEscrow() {
    setBusy(true);
    try {
      const id = Number(escrowId);
      if (!Number.isSafeInteger(id) || id < 0) throw new Error("أدخل رقم ضمان صحيحاً.");
      Unicrow.config({ chainId: BigInt(CHAIN_ID), autoSwitchNetwork: false });
      const data: any = await (Unicrow as any).core.getEscrowData(id);
      setEscrowInfo(data);
      setStatus("تمت قراءة بيانات الضمان من عقد Unicrow.");
    } catch (e) { setStatus(e instanceof Error ? e.message : "تعذرت قراءة الضمان."); }
    finally { setBusy(false); }
  }

  async function settle(action: "release" | "claim") {
    setBusy(true); setTxHash("");
    try {
      const id = Number(escrowId);
      if (!Number.isSafeInteger(id) || id < 0) throw new Error("أدخل رقم ضمان صحيحاً.");
      const p = getWallet();
      if (!p) throw new Error("اتصل بمحفظة Rabby.");
      const accounts = await p.request({ method: "eth_requestAccounts" });
      const currentChain = String(await p.request({ method: "eth_chainId" })).toLowerCase();
      if (currentChain !== CHAIN_HEX) throw new Error("هذه الصفحة مخصصة لشبكة Base Sepolia فقط.");
      setWallet(getAddress(accounts[0]));
      Unicrow.config({ chainId: BigInt(CHAIN_ID), autoSwitchNetwork: false });
      setStatus(action === "release" ? "سيُفتح تأكيد تحرير الضمان من Unicrow." : "سيُفتح تأكيد المطالبة من Unicrow.");
      const hash = await (Unicrow as any).ui[action](id);
      setTxHash(String(hash));
      setStatus("أُرسلت العملية. تحقق من تأكيدها على BaseScan.");
      await loadEscrow();
    } catch (e) { setStatus(e instanceof Error ? e.message : "تعذر تنفيذ العملية."); }
    finally { setBusy(false); }
  }

  const btn: React.CSSProperties = { border: 0, borderRadius: 9, padding: "11px 16px", background: "#e58a1f", color: "#fff", fontWeight: 700, cursor: "pointer", margin: "5px" };
  const input: React.CSSProperties = { width: "100%", padding: 11, border: "1px solid #cbd5e1", borderRadius: 8, marginTop: 6, direction: "ltr" };

  return <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 22, marginTop: 24 }}>
    <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: 12, lineHeight: 1.8, color: "#9a3412" }}>
      اختبار على Base Sepolia فقط. USDC هنا تجريبي وليس له قيمة نقدية. لا تبدّل إلى Base Mainnet أو Arbitrum One.
    </div>
    <div style={{ marginTop: 16 }}>
      <button style={btn} disabled={busy} onClick={connect}>اتصال Rabby</button>
      <button style={{ ...btn, background: "#475569" }} disabled={busy} onClick={switchNetwork}>اختيار Base Sepolia</button>
      <p>العنوان: <code dir="ltr">{wallet || "غير متصل"}</code></p>
      <p>Chain ID: <code dir="ltr">{chain || "—"}</code> {chain === CHAIN_HEX ? "· Base Sepolia" : ""}</p>
    </div>
    <hr style={{ margin: "18px 0", borderColor: "#e2e8f0" }} />
    <h2 style={{ fontSize: 20, fontWeight: 800 }}>إنشاء ضمان تجريبي</h2>
    <label style={{ display: "block", marginTop: 12 }}>عنوان Ethereum للمستفيد<input style={input} value={seller} onChange={e => setSeller(e.target.value)} placeholder="0x..." /></label>
    <label style={{ display: "block", marginTop: 12 }}>المبلغ (USDC تجريبي)<input style={input} type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label>
    <label style={{ display: "block", marginTop: 12 }}>فترة التحدي بالأيام<input style={input} type="number" min="1" max="30" step="1" value={days} onChange={e => setDays(e.target.value)} /></label>
    <label style={{ display: "block", marginTop: 12 }}>مرجع نصي<input style={input} value={reference} onChange={e => setReference(e.target.value)} maxLength={100} /></label>
    <p style={{ color: "#64748b", lineHeight: 1.8, fontSize: 13 }}>عنوان USDC التجريبي المستخدم: <code dir="ltr">{USDC}</code>. سيطلب Unicrow موافقة USDC أولاً إذا لزم الأمر، ثم إيداع الضمان. لا توافق إلا إذا أظهرت Rabby شبكة Base Sepolia وعنوان الرمز الصحيح.</p>
    <button style={btn} disabled={busy || chain !== CHAIN_HEX} onClick={createEscrow}>{busy ? "جارٍ التنفيذ..." : "فتح نموذج Unicrow وإنشاء الضمان"}</button>
    <hr style={{ margin: "18px 0", borderColor: "#e2e8f0" }} />
    <h2 style={{ fontSize: 20, fontWeight: 800 }}>قراءة ضمان أو تحريره أو المطالبة به</h2>
    <label style={{ display: "block", marginTop: 12 }}>رقم الضمان (Escrow ID)<input style={input} value={escrowId} onChange={e => setEscrowId(e.target.value)} placeholder="مثلاً 12" /></label>
    <button style={{ ...btn, background: "#475569" }} disabled={busy || !escrowId} onClick={loadEscrow}>قراءة بيانات الضمان</button>
    <button style={btn} disabled={busy || !escrowId} onClick={() => settle("release")}>تحرير من حساب المشتري</button>
    <button style={btn} disabled={busy || !escrowId} onClick={() => settle("claim")}>مطالبة من حساب البائع</button>
    {txHash && <p style={{ marginTop: 12 }}>معاملة: <a href={EXPLORER + txHash} target="_blank" rel="noreferrer" style={{ color: "#b45309" }} dir="ltr">{txHash}</a></p>}
    {escrowInfo && <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "#f8fafc", padding: 12, borderRadius: 8, fontSize: 12 }}>{JSON.stringify(escrowInfo, (_, v) => typeof v === "bigint" ? v.toString() : v, 2)}</pre>}
    <p role="status" style={{ background: "#f8fafc", borderRadius: 8, padding: 12, lineHeight: 1.8 }}>{status}</p>
  </section>;
}
