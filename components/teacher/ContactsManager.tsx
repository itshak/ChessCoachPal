"use client";

import {useCallback,useEffect,useState,type FormEvent} from "react";
import {useTranslations} from "next-intl";
import Link from "next/link";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";

type Contact={
  id:string;displayName:string;kind:"person"|"organization";
  status:"active"|"archived";revision:number;
};
type Detail=Contact&{email:string|null;phone:string|null;preferredLocale:"en"|"he"|"ru"|null};
type Payer={
  id:string;displayName:string;accountKind:"person"|"organization";
  status:"active"|"archived";revision:number;
};
type PayerDetail=Payer&{contactId:string|null};
type Student={id:string;name:string};
type StudentLink={
  id:string;studentId:string;contactId:string;relationshipLabel:string;
  isLegalGuardian:boolean;mayReceiveMessages:boolean;
  emergencyPriority:number|null;activeFrom:string|null;
  activeTo:string|null;revision:number;
};
type ContactForm={
  displayName:string;kind:"person"|"organization";email:string;phone:string;
  preferredLocale:""|"en"|"he"|"ru";status:"active"|"archived";
};
type PayerForm={
  displayName:string;accountKind:"person"|"organization";contactId:string;
  status:"active"|"archived";
};
const emptyContact:ContactForm={
  displayName:"",kind:"person",email:"",phone:"",preferredLocale:"",status:"active",
};
const emptyPayer:PayerForm={
  displayName:"",accountKind:"person",contactId:"",status:"active",
};
const control="w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground";
const label="block text-sm font-medium mb-1";
const activeVariant="primary" as const;
const inactiveVariant="secondary" as const;
async function jsonResponse<T>(response:Response):Promise<T>{
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(
    data&&typeof data.error==="string"?data.error:"REQUEST_FAILED");
  return data as T;
}

export function ContactsManager(){
  const t=useTranslations("contacts");
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [payers,setPayers]=useState<Payer[]>([]);
  const [students,setStudents]=useState<Student[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [mode,setMode]=useState<"contacts"|"billing">("contacts");
  const [editingContact,setEditingContact]=useState<string|"new"|null>(null);
  const [contact,setContact]=useState<Detail|null>(null);
  const [contactForm,setContactForm]=useState<ContactForm>(emptyContact);
  const [links,setLinks]=useState<StudentLink[]>([]);
  const [studentId,setStudentId]=useState("");
  const [relationship,setRelationship]=useState("");
  const [isGuardian,setIsGuardian]=useState(false);
  const [mayMessage,setMayMessage]=useState(false);
  const [priority,setPriority]=useState("");
  const [editingPayer,setEditingPayer]=useState<string|"new"|null>(null);
  const [payer,setPayer]=useState<PayerDetail|null>(null);
  const [payerForm,setPayerForm]=useState<PayerForm>(emptyPayer);

  const reload=useCallback(async()=>{
    try{
      const [contactRows,payerRows]=await Promise.all([
        fetch("/api/contacts",{cache:"no-store"}).then(jsonResponse<Contact[]>),
        fetch("/api/billing-accounts",{cache:"no-store"}).then(jsonResponse<Payer[]>),
      ]);
      const learnerRows:Student[]=[];
      for(let offset=0;offset<=20000;offset+=500){
        const result=await fetch("/api/students?limit=500&offset="+offset,
          {cache:"no-store"}).then(jsonResponse<{students:Student[];nextOffset:number|null}>);
        learnerRows.push(...result.students.map(s=>({id:s.id,name:s.name})));
        if(result.nextOffset===null)break;
        if(offset>=20000)throw new Error("ROSTER_TOO_LARGE");
      }
      setContacts(contactRows);setPayers(payerRows);setStudents(learnerRows);
      setError("");
    }catch{
      setError(t("loadError"));
    }finally{
      setLoading(false);
    }
  },[t]);
  useEffect(()=>{void reload();},[reload]);

  function resetMessages(){setError("");setNotice("");}
  async function selectContact(id:string){
    resetMessages();setEditingContact(id);setContact(null);setLinks([]);
    try{
      const [detail,history]=await Promise.all([
        fetch("/api/contacts/"+id,{cache:"no-store"}).then(jsonResponse<Detail>),
        fetch("/api/contacts/"+id+"/links",{cache:"no-store"}).then(jsonResponse<StudentLink[]>),
      ]);
      setContact(detail);setLinks(history);
      setContactForm({
        displayName:detail.displayName,kind:detail.kind,
        email:detail.email??"",phone:detail.phone??"",
        preferredLocale:detail.preferredLocale??"",status:detail.status,
      });
    }catch{setError(t("loadError"));}
  }
  async function saveContact(event:FormEvent){
    event.preventDefault();
    if(!contactForm.displayName.trim()||busy)return;
    setBusy(true);resetMessages();
    try{
      const isNew=editingContact==="new";
      const target=isNew?"/api/contacts":"/api/contacts/"+editingContact;
      const payload={
        displayName:contactForm.displayName,kind:contactForm.kind,
        email:contactForm.email.trim()||null,phone:contactForm.phone.trim()||null,
        preferredLocale:contactForm.preferredLocale||null,
        ...(isNew?{}:{status:contactForm.status,expectedRevision:contact!.revision}),
        idempotencyKey:crypto.randomUUID(),
      };
      const saved=await fetch(target,{
        method:isNew?"POST":"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload),
      }).then(jsonResponse<Detail>);
      await reload();
      await selectContact(saved.id);
      setNotice(t(isNew?"contactCreated":"contactUpdated"));
    }catch{setError(t("saveError"));}
    finally{setBusy(false);}
  }
  async function linkStudent(event:FormEvent){
    event.preventDefault();
    if(!contact||!studentId||!relationship.trim()||busy)return;
    setBusy(true);resetMessages();
    try{
      await fetch("/api/students/"+studentId+"/contacts",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          contactId:contact.id,relationshipLabel:relationship,
          isLegalGuardian:isGuardian,mayReceiveMessages:mayMessage,
          emergencyPriority:priority?Number(priority):null,
          idempotencyKey:crypto.randomUUID(),
        }),
      }).then(jsonResponse<StudentLink>);
      setLinks(await fetch("/api/contacts/"+contact.id+"/links",
        {cache:"no-store"}).then(jsonResponse<StudentLink[]>));
      setRelationship("");setPriority("");setIsGuardian(false);setMayMessage(false);
      setNotice(t("linked"));
    }catch{setError(t("saveError"));}
    finally{setBusy(false);}
  }
  async function endLink(record:StudentLink){
    if(!contact||busy||!window.confirm(t("endLinkConfirm")))return;
    setBusy(true);resetMessages();
    try{
      await fetch("/api/students/"+record.studentId+"/contacts/"+record.id,{
        method:"DELETE",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({expectedRevision:record.revision,idempotencyKey:crypto.randomUUID()}),
      }).then(jsonResponse<StudentLink>);
      setLinks(await fetch("/api/contacts/"+contact.id+"/links",
        {cache:"no-store"}).then(jsonResponse<StudentLink[]>));
      setNotice(t("unlinkSuccess"));
    }catch{setError(t("saveError"));}
    finally{setBusy(false);}
  }
  async function selectPayer(id:string){
    resetMessages();setEditingPayer(id);setPayer(null);
    try{
      const detail=await fetch("/api/billing-accounts/"+id,
        {cache:"no-store"}).then(jsonResponse<PayerDetail>);
      setPayer(detail);
      setPayerForm({displayName:detail.displayName,accountKind:detail.accountKind,
        contactId:detail.contactId??"",status:detail.status});
    }catch{setError(t("loadError"));}
  }
  async function savePayer(event:FormEvent){
    event.preventDefault();
    if(!payerForm.displayName.trim()||busy)return;
    setBusy(true);resetMessages();
    try{
      const isNew=editingPayer==="new";
      const target=isNew?"/api/billing-accounts":"/api/billing-accounts/"+editingPayer;
      const payload={
        displayName:payerForm.displayName,accountKind:payerForm.accountKind,
        contactId:payerForm.contactId||null,
        ...(isNew?{}:{status:payerForm.status,expectedRevision:payer!.revision}),
        idempotencyKey:crypto.randomUUID(),
      };
      const saved=await fetch(target,{
        method:isNew?"POST":"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload),
      }).then(jsonResponse<PayerDetail>);
      await reload();
      await selectPayer(saved.id);
      setNotice(t("payerSaved"));
    }catch{setError(t("saveError"));}
    finally{setBusy(false);}
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("title")}>
      <Button variant={mode==="contacts"?activeVariant:inactiveVariant} size="sm"
        onClick={()=>{setMode("contacts");resetMessages();}}>{t("contacts")}</Button>
      <Button variant={mode==="billing"?activeVariant:inactiveVariant} size="sm"
        onClick={()=>{setMode("billing");resetMessages();}}>{t("payers")}</Button>
      <Button variant="ghost" size="sm" onClick={()=>{setLoading(true);void reload();}}>
        {t("refresh")}
      </Button>
    </div>
    {error&&<p role="alert" className="text-error text-sm">{error}</p>}
    {notice&&<p role="status" className="text-sm">{notice}</p>}
    {loading&&<p className="text-muted">{t("loading")}</p>}
    {mode==="contacts"&&<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">{t("allContacts")}</h2>
          <Button size="sm" onClick={()=>{
            resetMessages();setEditingContact("new");setContact(null);
            setContactForm(emptyContact);setLinks([]);
          }}>{t("addContact")}</Button>
        </div>
        {contacts.length===0&&<p className="text-muted text-sm">{t("emptyContacts")}</p>}
        <div className="space-y-1 max-h-[38rem] overflow-y-auto">
          {contacts.map(c=><button key={c.id} type="button"
            className={"w-full rounded-lg px-3 py-2 text-start text-sm hover:bg-surface-hover "+
              (editingContact===c.id?"border border-primary":"")}
            aria-pressed={editingContact===c.id}
            onClick={()=>{void selectContact(c.id);}}>
            <div className="font-medium"><bdi dir="auto">{c.displayName}</bdi></div>
            <div className="text-muted">{t(c.kind)} · {t(c.status)}</div>
          </button>)}
        </div>
      </Card>
      <div className="space-y-5">
        {editingContact===null?<Card><p className="text-sm text-muted">{t("selectContact")}</p></Card>:
        <Card className="space-y-4">
          <h2 className="font-semibold">{editingContact==="new"?t("addContact"):t("editContact")}</h2>
          <form className="space-y-3" onSubmit={event=>{void saveContact(event);}}>
            <label className={label}>{t("contactName")}
              <input className={control} required maxLength={160}
                value={contactForm.displayName}
                onChange={e=>setContactForm({...contactForm,displayName:e.target.value})}/>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>{t("kind")}
                <select className={control} value={contactForm.kind}
                  onChange={e=>setContactForm({...contactForm,kind:e.target.value as ContactForm["kind"]})}>
                  <option value="person">{t("person")}</option>
                  <option value="organization">{t("organization")}</option>
                </select>
              </label>
              {editingContact!=="new"&&<label className={label}>{t("status")}
                <select className={control} value={contactForm.status}
                  onChange={e=>setContactForm({...contactForm,status:e.target.value as ContactForm["status"]})}>
                  <option value="active">{t("active")}</option>
                  <option value="archived">{t("archived")}</option>
                </select>
              </label>}
              <label className={label}>{t("email")}
                <input className={control} type="email" dir="ltr" maxLength={320}
                  value={contactForm.email}
                  onChange={e=>setContactForm({...contactForm,email:e.target.value})}/>
              </label>
              <label className={label}>{t("phone")}
                <input className={control} type="tel" dir="ltr" maxLength={80}
                  value={contactForm.phone}
                  onChange={e=>setContactForm({...contactForm,phone:e.target.value})}/>
              </label>
              <label className={label}>{t("language")}
                <select className={control} value={contactForm.preferredLocale}
                  onChange={e=>setContactForm({...contactForm,preferredLocale:e.target.value as ContactForm["preferredLocale"]})}>
                  <option value="">{t("defaultLanguage")}</option>
                  <option value="en">{t("englishName")}</option>
                  <option value="he">{t("hebrewName")}</option>
                  <option value="ru">{t("russianName")}</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy||(!contact&&editingContact!=="new")}>
                {busy?t("saving"):t("save")}
              </Button>
              <Button type="button" variant={inactiveVariant} onClick={()=>{
                setEditingContact(null);setContact(null);resetMessages();
              }}>{t("cancel")}</Button>
            </div>
          </form>
        </Card>}
        {editingContact!=="new"&&contact&&<Card className="space-y-4">
          <h2 className="font-semibold">{t("studentLinks")}</h2>
          <p className="text-sm text-muted">{t("notShared")}</p>
          {links.length===0?<p className="text-sm text-muted">{t("noLinks")}</p>:
            <div className="space-y-2">{links.map(link=><div key={link.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
              <div><bdi dir="auto">{students.find(x=>x.id===link.studentId)?.name??link.studentId}</bdi>
                <span className="text-muted"> · <bdi dir="auto">{link.relationshipLabel}</bdi></span>
                {link.activeTo&&<span className="text-muted"> · {t("archived")}</span>}
              </div>
              {!link.activeTo&&<Button size="sm" variant="ghost" disabled={busy}
                onClick={()=>{void endLink(link);}}>{t("unlink")}</Button>}
            </div>)}</div>}
          {contact.status==="active"&&<form className="space-y-3" onSubmit={event=>{void linkStudent(event);}}>
            <label className={label}>{t("student")}
              <select className={control} value={studentId} required
                onChange={e=>setStudentId(e.target.value)}>
                <option value="">{t("student")}</option>
                {students.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>{t("relationship")}
                <input className={control} required maxLength={80} value={relationship}
                  onChange={e=>setRelationship(e.target.value)}/>
              </label>
              <label className={label}>{t("priority")}
                <input className={control} type="number" min={1} max={20}
                  value={priority} onChange={e=>setPriority(e.target.value)}/>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isGuardian}
                onChange={e=>setIsGuardian(e.target.checked)}/>{t("legalGuardian")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={mayMessage}
                onChange={e=>setMayMessage(e.target.checked)}/>{t("mayMessage")}
            </label>
            <Button type="submit" disabled={busy||!studentId||!relationship.trim()}>
              {t("linkContact")}</Button>
          </form>}
          {contact.status==="archived"&&<p className="text-sm text-muted">{t("archiveHint")}</p>}
        </Card>}
      </div>
    </div>}
    {mode==="billing"&&<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t("allPayers")}</h2>
          <Button size="sm" onClick={()=>{resetMessages();setEditingPayer("new");
            setPayer(null);setPayerForm(emptyPayer);}}>{t("addPayer")}</Button>
        </div>
        {payers.length===0&&<p className="text-sm text-muted">{t("emptyPayers")}</p>}
        <div className="space-y-1 max-h-[38rem] overflow-y-auto">
          {payers.map(p=><button key={p.id} type="button"
            className={"w-full rounded-lg px-3 py-2 text-start text-sm hover:bg-surface-hover "+
              (editingPayer===p.id?"border border-primary":"")}
            aria-pressed={editingPayer===p.id} onClick={()=>{void selectPayer(p.id);}}>
            <div className="font-medium"><bdi dir="auto">{p.displayName}</bdi></div>
            <div className="text-muted">{t(p.accountKind)} · {t(p.status)}</div>
          </button>)}
        </div>
      </Card>
      {editingPayer===null?<Card><p className="text-sm text-muted">{t("noPayerSelected")}</p></Card>:
      <Card className="space-y-4">
        <h2 className="font-semibold">{editingPayer==="new"?t("addPayer"):t("editPayer")}</h2>
        <p className="text-sm text-muted">{t("billingNotice")}</p>
        <form className="space-y-3" onSubmit={event=>{void savePayer(event);}}>
          <label className={label}>{t("billingName")}
            <input className={control} required maxLength={160}
              value={payerForm.displayName}
              onChange={e=>setPayerForm({...payerForm,displayName:e.target.value})}/>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>{t("kind")}
              <select className={control} value={payerForm.accountKind}
                onChange={e=>setPayerForm({...payerForm,accountKind:e.target.value as PayerForm["accountKind"]})}>
                <option value="person">{t("person")}</option>
                <option value="organization">{t("organization")}</option>
              </select>
            </label>
            <label className={label}>{t("linkedContact")}
              <select className={control} value={payerForm.contactId}
                onChange={e=>setPayerForm({...payerForm,contactId:e.target.value})}>
                <option value="">{t("noPayerContact")}</option>
                {contacts.map(c=><option value={c.id} key={c.id}>{c.displayName}</option>)}
              </select>
            </label>
            {editingPayer!=="new"&&<label className={label}>{t("status")}
              <select className={control} value={payerForm.status}
                onChange={e=>setPayerForm({...payerForm,status:e.target.value as PayerForm["status"]})}>
                <option value="active">{t("active")}</option>
                <option value="archived">{t("archived")}</option>
              </select>
            </label>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy||(!payer&&editingPayer!=="new")}>
              {busy?t("saving"):t("save")}
            </Button>
            <Button type="button" variant={inactiveVariant}
              onClick={()=>{setEditingPayer(null);setPayer(null);resetMessages();}}>
              {t("cancel")}</Button>
          </div>
        </form>
      </Card>}
    </div>}
    <p className="text-sm text-muted">
      <Link className="underline hover:text-primary" href="/families">
        {t("legacyFamilyManagement")}
      </Link>
    </p>
  </div>;
}
