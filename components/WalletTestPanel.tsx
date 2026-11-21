"use client";
import {useState} from "react";

type Eip1193Provider = { request(args:{method:string;params?:unknown[]|object}):Promise<unknown>; };
declare global { interface Window { ethereum?: Eip1193Provider & {isRabby?:boolean;providers?:Array<Eip1193Provider & {isRabby?:boolean}>}; } }

const TARGET_CHAIN_ID = "0x14a34"; // Base Sepolia (84532), supported by the official Unicrow SDK source
function shortAddress(value:string){return value.slice(0,6)+"…"+value.slice(-4);}

export default function WalletTestPanel(){
 const [address,setAddress]=useState("");
 const [chain,setChain]=useState("");
 const [status,setStatus]=useState("لم يتم الاتصال بعد.");
 const [busy,setBusy]=useState(false);
 async function connect(){
  setBusy(true);setStatus("");
  try{
   const candidates=window.ethereum?.providers?.length?window.ethereum.providers:[window.ethereum];
   const provider=candidates.find(p=>p?.isRabby) || window.ethereum;
   if(!provider)throw new Error("لم نعثر على محفظة متوافقة. افتح Rabby ثم أعد تحميل الصفحة.");
   const accounts=await provider.request({method:"eth_requestAccounts"}) as string[];
   if(!Array.isArray(accounts)||!accounts[0])throw new Error("لم يتم إرجاع عنوان محفظة.");
   const chainId=String(await provider.request({method:"eth_chainId"}));
   setAddress(accounts[0]);setChain(chainId);
   if(chainId.toLowerCase()!==TARGET_CHAIN_ID){
    setStatus("تم الاتصال، لكن الشبكة الحالية ليست Base Sepolia. لم ننفذ أي معاملة.");
   }else setStatus("نجح الاتصال على شبكة الاختبار Base Sepolia. لم يتم إرسال أي معاملة.");
  }catch(e){setStatus(e instanceof Error?e.message:"تعذر الاتصال بالمحفظة.");}
  finally{setBusy(false);}
 }
 async function switchNetwork(){
  const candidates=window.ethereum?.providers?.length?window.ethereum.providers:[window.ethereum];
  const provider=candidates.find(p=>p?.isRabby) || window.ethereum;
  if(!provider){setStatus("لم يتم العثور على المحفظة.");return;}
  try{
   await provider.request({method:"wallet_switchEthereumChain",params:[{chainId:TARGET_CHAIN_ID}]});
   const id=String(await provider.request({method:"eth_chainId"}));setChain(id);
   setStatus(id.toLowerCase()===TARGET_CHAIN_ID?"تم اختيار شبكة Base Sepolia بنجاح.":"لم يتم تأكيد تغيير الشبكة.");
  }catch(e){setStatus(e instanceof Error?e.message:"تعذر تغيير الشبكة.");}
 }
 return <section style={{border:"1px solid #e2e8f0",borderRadius:16,padding:22,marginTop:24,background:"#fff"}}>
  <h2 style={{fontSize:20,fontWeight:700}}>اتصال آمن — بدون معاملات</h2>
  <p style={{color:"#64748b",lineHeight:1.8}}>سنقرأ عنوان الحساب ومعرّف الشبكة فقط. لا نطلب صلاحية إرسال الأموال.</p>
  <button onClick={connect} disabled={busy} style={{background:"#ea8a19",color:"#fff",border:0,borderRadius:10,padding:"12px 20px",fontWeight:700,cursor:"pointer"}}>{busy?"جارٍ الاتصال…":"اتصال بمحفظة Rabby"}</button>
  {address&&<div style={{marginTop:18,lineHeight:2}}><div><b>العنوان المتصل:</b> <code dir="ltr">{shortAddress(address)}</code></div><div><b>Chain ID:</b> <code dir="ltr">{chain}</code></div><div><b>الشبكة المطلوبة:</b> Base Sepolia (84532)</div>{chain.toLowerCase()!==TARGET_CHAIN_ID&&<button onClick={switchNetwork} style={{marginTop:12,border:"1px solid #cbd5e1",background:"#f8fafc",padding:"9px 14px",borderRadius:8,cursor:"pointer"}}>التبديل إلى شبكة الاختبار</button>}</div>}
  <p role="status" style={{marginTop:18,padding:12,borderRadius:8,background:"#f8fafc",lineHeight:1.8}}>{status}</p>
  <p style={{fontSize:13,color:"#b45309",lineHeight:1.8}}>تنبيه: لا ترسل عبارة الاسترداد أو المفتاح الخاص. هذه الصفحة لا تنفذ دفعاً أو موافقة Token أو تحويل أموال.</p>
 </section>;
}