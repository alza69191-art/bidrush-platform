"use client";
import {useEffect,useState} from "react";
export default function AuctionExpiryGuard({endsAt,children}:{endsAt:number|string;children:React.ReactNode}){
 const deadline=Number(endsAt);
 const [visible,setVisible]=useState(()=>Number.isFinite(deadline)&&deadline>Date.now());
 useEffect(()=>{
  if(!Number.isFinite(deadline)){setVisible(false);return;}
  const remaining=deadline-Date.now();
  if(remaining<=0){setVisible(false);return;}
  const timer=window.setTimeout(()=>setVisible(false),remaining);
  return ()=>window.clearTimeout(timer);
 },[deadline]);
 return visible?<>{children}</>:null;
}
