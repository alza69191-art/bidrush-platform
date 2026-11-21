"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import WorkspaceShell from "@/components/WorkspaceShell";

export default function NewAuction(){
  const router=useRouter();
  const [form,setForm]=useState({title:"",description:"",category:"تصميم",maxBudget:"",currency:"USD",durationMinutes:"5",deadlineHours:"24"});
  const [image,setImage]=useState<File|null>(null);
  const [preview,setPreview]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  function change(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>){
    setForm({...form,[e.target.name]:e.target.value});
  }

  function choose(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];
    setError("");
    if(!file){setImage(null);setPreview("");return;}
    if(!file.type.startsWith("image/")||file.type==="image/svg+xml"||file.size>10*1024*1024){
      setImage(null);setPreview("");e.target.value="";
      setError("اختر صورة بصيغة شائعة وبحجم لا يتجاوز 10 ميغابايت. SVG غير مدعوم لأسباب أمنية.");
      return;
    }
    const reader=new FileReader();
    reader.onload=()=>{
      if(typeof reader.result==="string"){
        setImage(file);
        setPreview(reader.result);
      }else{
        setImage(null);setPreview("");
        setError("تعذرت قراءة الصورة. جرّب اختيارها مرة أخرى.");
      }
    };
    reader.onerror=()=>{
      setImage(null);setPreview("");
      setError("تعذرت قراءة الصورة من جهازك. جرّب ملفاً آخر.");
    };
    reader.readAsDataURL(file);
  }

  async function submit(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError("");
    try{
      const data=new FormData();
      Object.entries(form).forEach(([k,v])=>data.append(k,v));
      if(image)data.append("image",image,image.name);
      const r=await fetch("/api/auctions",{method:"POST",body:data});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"تعذر إنشاء المزاد");
      if(image&&!d.imageAttached)throw new Error("تم إنشاء المزاد لكن لم يؤكد الخادم حفظ الصورة. أعد المحاولة.");
      router.push("/auctions/"+d.id);
    }catch(x){
      setError(x instanceof Error?x.message:"حدث خطأ أثناء إنشاء المزاد.");
    }finally{
      setBusy(false);
    }
  }

  return <WorkspaceShell>
    <div className="page-heading"><span className="eyebrow">انشر طلبك</span><h1>إنشاء مزاد جديد</h1><p>أضف صورة توضيحية وتفاصيل دقيقة ليقدم المستقلون عروضاً مناسبة.</p></div>
    <form className="content-card form-grid" onSubmit={submit}>
      <label>عنوان المهمة<input name="title" minLength={8} maxLength={160} required value={form.title} onChange={change} placeholder="مثال: تصميم صفحة هبوط لمتجر إلكتروني"/></label>
      <label>التصنيف<select name="category" value={form.category} onChange={change}>{["تصميم","برمجة","كتابة وترجمة","تسويق","مونتاج","صوتيات","أعمال إدارية","أخرى"].map(x=><option key={x}>{x}</option>)}</select></label>
      <label className="full-field">وصف المهمة<textarea name="description" minLength={30} maxLength={5000} required rows={6} value={form.description} onChange={change} placeholder="اشرح المطلوب والمخرجات ومعايير القبول بوضوح..."/></label>
      <label className="full-field">صورة المزاد (اختيارية، حتى 10 ميغابايت)
        <input type="file" accept="image/*" onChange={choose}/>
        {image&&<span style={{display:"block",marginTop:8}}>تم اختيار: {image.name} ({(image.size/1024).toFixed(0)} كيلوبايت)</span>}
        {preview&&<img src={preview} alt="معاينة صورة المزاد" style={{display:"block",maxWidth:260,maxHeight:180,objectFit:"contain",borderRadius:12,marginTop:10}}/>}
      </label>
      <label>الميزانية القصوى<input type="number" name="maxBudget" min="1" max="1000000" step="0.01" required value={form.maxBudget} onChange={change}/></label>
      <label>العملة<select name="currency" value={form.currency} onChange={change}>{["USD","EUR","ILS","SAR","AED"].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>مدة المزاد<select name="durationMinutes" value={form.durationMinutes} onChange={change}><option value="5">5 دقائق</option><option value="10">10 دقائق</option><option value="15">15 دقيقة</option><option value="30">30 دقيقة</option></select></label>
      <label>مهلة التسليم<select name="deadlineHours" value={form.deadlineHours} onChange={change}>{[1,6,12,24,48,72,168,720].map(x=><option value={x} key={x}>{x<24?x+" ساعة":x/24+" يوم"}</option>)}</select></label>
      <div className="notice full-field">الوساطة والدفع خارج BidRush حالياً. لا تحتجز المنصة الأموال ولا تضمن التسوية.</div>
      {error&&<div className="form-error full-field" role="alert">{error}</div>}
      <button disabled={busy} className="btn btn-primary full-field">{busy?"جارٍ النشر...":"نشر المزاد واستقبال العروض"}</button>
    </form>
  </WorkspaceShell>;
}
