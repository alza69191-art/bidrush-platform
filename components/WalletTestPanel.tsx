"use client";
import {useState} from "react";

const TARGET_CHAIN_ID = "0x14a34"; // Base Sepolia (84532)
function shortAddress(value:string){return value.slice(0,6)+"…"+value.slice(-4);}
function injected(){return (window as any).ethereum as any;}

export default function WalletTestPanel(){
 const [address,setAddress]=useState("");
 const [chain,setChain]=useState("");
 const [status,setStatus]=useState("لم يتم الاتصال بعد.");
 const [busy,setBusy]=useState(false);
 const [saved,setSaved]=useState(false);
 async function connect(){
  setBusy(true);setStatus("");
  try{
   const ethereum=injected();
   const candidates=ethereum?.providers?.length?ethereum.providers:[ethereum];
   const provider=candidates.find((p:any)=>p?.isRabby) || ethereum;
   if(!provider)throw new Error("لم نعثر على محفظة متوافقة. افتح Rabby ثم أعد تحميل الصفحة.");
   const accounts=await provider.request({method:"eth_requestAccounts"}) as string[];
   if(!Array.isArray(accounts)||!accounts[0])throw new Error("لم يتم إرجاع عنوان محفظة.");
   const chainId=String(await provider.request({method:"eth_chainId"}));
   setAddress(accounts[0]);setChain(chainId);setSaved(false);
   if(chainId.toLowerCase()!==TARGET_CHAIN_ID)setStatus("تم الاتصال، لكن الشبكة الحالية ليست Base Sepolia. لم ننفذ أي معاملة.");
   else setStatus("نجح الاتصال على شبكة الاختبار Base Sepolia. لم يتم إرسال أي معاملة.");
  }catch(e){setStatus(e instanceof Error?e.message:"تعذر الاتصال بالمحفظة.");}
  finally{setBusy(false);}
 }
 async function saveWallet(){
  if(chain.toLowerCase()!==TARGET_CHAIN_ID){setStatus("حوّل الشبكة إلى Base Sepolia قبل حفظ عنوان المحفظة.");return;}
  setBusy(true);
  try{
   const ethereum=injected();
   const candidates=ethereum?.providers?.length?ethereum.providers:[ethereum];
   const provider=candidates.find((p:any)=>p?.isRabby)||ethereum;
   if(!provider)throw new Error("لم نعثر على Rabby.");
   const challengeResponse=await fetch("/api/wallet",{cache:"no-store"});
   const challenge=await challengeResponse.json();
   if(!challengeResponse.ok)throw new Error(challenge.error||"تعذر بدء التحقق.");
   const message="BidRush wallet verification\\nAddress: "+address+"\\nChain ID: 84532\\nNonce: "+challenge.nonce;
   const hex="0x"+Array.from(new TextEncoder().encode(message)).map(x=>x.toString(16).padStart(2,"0")).join("");
   const signature=await provider.request({method:"personal_sign",params:[hex,address]}) as string;
   const r=await fetch("/api/wallet",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({address,nonce:challenge.nonce,signature})});
   const d=await r.json();if(!r.ok)throw new Error(d.error||"تعذر حفظ العنوان.");
   setSaved(true);setStatus("تم التحقق من ملكية العنوان وربطه بحساب BidRush. لم يتم إرسال أي معاملة مالية.");
  }catch(e){setStatus(e instanceof Error?e.message:"تعذر حفظ العنوان.");}
  finally{setBusy(false);}
 }
 async function switchNetwork(){
  const ethereum=injected();
  const candidates=ethereum?.providers?.length?ethereum.providers:[ethereum];
  const provider=candidates.find((p:any)=>p?.isRabby)||ethereum;
  if(!provider){setStatus("لم يتم العثور على المحفظة.");return;}
  try{
   try{await provider.request({method:"wallet_switchEthereumChain",params:[{chainId:TARGET_CHAIN_ID}]});}
   catch(error){
    const code=(error as {code?:number})?.code;
    if(code!==4902)throw error;
    await provider.request({method:"wallet_addEthereumChain",params:[{chainId:TARGET_CHAIN_ID,chainName:"Base Sepolia",nativeCurrency:{name:"Ether",symbol:"ETH",decimals:18},rpcUrls:["https://sepolia.base.org"],blockExplorerUrls:["https://sepolia.basescan.org"]}]});
    await provider.request({method:"wallet_switchEthereumChain",params:[{chainId:TARGET_CHAIN_ID}]});
   }
   const id=String(await provider.request({method:"eth_chainId"}));setChain(id);
   setStatus(id.toLowerCase()===TARGET_CHAIN_ID?"تم اختيار شبكة Base Sepolia بنجاح.":"لم يتم تأكيد تغيير الشبكة.");
  }catch(e){setStatus(e instanceof Error?e.message:"تعذر تغيير الشبكة.");}
 }
 return <section style={{border:"1px solid #e2e8f0",borderRadius:16,padding:22,marginTop:24,background:"#fff"}}>
  <h2 style={{fontSize:20,fontWeight:700}}>اتصال آمن — توقيع تحقق فقط</h2>
  <p style={{color:"#64748b",lineHeight:1.8}}>نقرأ عنوان الحساب والشبكة، ونطلب توقيع رسالة تحقق مجانية لإثبات ملكية العنوان. لا ننفذ معاملة بلوكشين ولا نطلب صلاحية إنفاق USDC.</p>
  <button onClick={connect} disabled={busy} style={{background:"#ea8a19",color:"#fff",border:0,borderRadius:10,padding:"12px 20px",fontWeight:700,cursor:"pointer"}}>{busy?"جارٍ الاتصال…":"اتصال بمحفظة Rabby"}</button>
  {address&&<div style={{marginTop:18,lineHeight:2}}><div><b>العنوان المتصل:</b> <code dir="ltr">{shortAddress(address)}</code></div><div><b>Chain ID:</b> <code dir="ltr">{chain}</code></div><div><b>الشبكة المطلوبة:</b> Base Sepolia (84532)</div>{chain.toLowerCase()===TARGET_CHAIN_ID&&<button onClick={saveWallet} disabled={busy||saved} style={{marginTop:12,marginInlineStart:8,border:0,background:saved?"#e2e8f0":"#ea8a19",color:saved?"#334155":"#fff",padding:"9px 14px",borderRadius:8,cursor:"pointer"}}>{saved?"تم حفظ العنوان":"حفظ العنوان في حساب BidRush"}</button>}{chain.toLowerCase()!==TARGET_CHAIN_ID&&<button onClick={switchNetwork} style={{marginTop:12,border:"1px solid #cbd5e1",background:"#f8fafc",padding:"9px 14px",borderRadius:8,cursor:"pointer"}}>التبديل إلى شبكة الاختبار</button>}</div>}
  <p role="status" style={{marginTop:18,padding:12,borderRadius:8,background:"#f8fafc",lineHeight:1.8}}>{status}</p>
  <p style={{fontSize:13,color:"#b45309",lineHeight:1.8}}>تنبيه: لا ترسل عبارة الاسترداد أو المفتاح الخاص. هذه الصفحة لا تنفذ دفعاً أو موافقة Token أو تحويل أموال. حفظ العنوان يربط العنوان العام بحسابك فقط.</p>
 </section>;
}