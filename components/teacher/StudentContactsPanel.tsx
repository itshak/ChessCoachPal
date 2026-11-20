"use client";

import {useCallback,useEffect,useState,type FormEvent} from "react";
import Link from "next/link";
import {useTranslations} from "next-intl";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";

type Contact={id:string;displayName:string;status:"active"|"archived"};
type Relationship={id:string;contactId:string;studentId:string;relationshipLabel:string;
  isLegalGuardian:boolean;mayReceiveMessages:boolean;activeTo:string|null;revision:number};
const inputClass="w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground";

export function StudentContactsPanel({studentId}:{studentId:string}){
  const t=useTranslations("contacts");
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [links,setLinks]=useState<Relationship[]>([]);
  const [contactId,setContactId]=useState("");
  const [relationship,setRelationship]=useState("");
  const [guardian,setGuardian]=useState(false);
  const [messages,setMessages]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const reload=useCallback(async()=>{
    try{
      const [a,b]=await Promise.all([
        fetch("/api/contacts",{cache:"no-store"}),
        fetch("/api/students/"+studentId+"/contacts",{cache:"no-store"}),
      ]);
      if(!a.ok||!b.ok)throw new Error("LOAD_FAILED");
      setContacts(await a.json() as Contact[]);
      setLinks(await b.json() as Relationship[]);
      setError("");
    }catch{setError(t("loadError"));}
    finally{setLoading(false);}
  },[studentId,t]);
  useEffect(()=>{void reload();},[reload]);

  async function link(event:FormEvent){
    event.preventDefault();
    if(busy||!contactId||!relationship.trim())return;
    setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch("/api/students/"+studentId+"/contacts",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({contactId,relationshipLabel:relationship.trim(),
          isLegalGuardian:guardian,mayReceiveMessages:messages,idempotencyKey:crypto.randomUUID()}),
      });
      if(!response.ok)throw new Error("SAVE_FAILED");
      setContactId("");setRelationship("");setGuardian(false);setMessages(false);
      await reload();setNotice(t("linked"));
    }catch{setError(t("saveError"));}
    finally{setBusy(false);}
  }
  async function endLink(item:Relationship){
    if(busy||!window.confirm(t("endLinkConfirm")))return;
    setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch("/api/students/"+studentId+"/contacts/"+item.id,{
        method:"DELETE",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({expectedRevision:item.revision,idempotencyKey:crypto.randomUUID()}),
      });
      if(!response.ok)throw new Error("SAVE_FAILED");
      await reload();setNotice(t("unlinkSuccess"));
    }catch{setError(t("saveError"));}
    finally{setBusy(false);}
  }
  const available=contacts.filter(c=>c.status==="active"&&
    !links.some(l=>l.contactId===c.id&&!l.activeTo));
  return <Card id="student-contacts" className="mt-6 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">{t("studentLinks")}</h2>
      <Link className="text-sm text-primary hover:underline" href="/contacts">{t("openContacts")}</Link>
    </div>
    {loading?<p className="text-sm text-muted">{t("loading")}</p>:
      links.length===0?<p className="text-sm text-muted">{t("noLinks")}</p>:
      <ul className="space-y-2">
        {links.map(item=><li key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm">
          <div>
            <bdi dir="auto">{contacts.find(c=>c.id===item.contactId)?.displayName??item.contactId}</bdi>
            {" · "}<bdi dir="auto">{item.relationshipLabel}</bdi>
            {item.isLegalGuardian&&<span className="ms-2 text-muted">{t("legalGuardian")}</span>}
            {item.mayReceiveMessages&&<span className="ms-2 text-muted">{t("mayMessage")}</span>}
            {item.activeTo&&<span className="ms-2 text-muted">{t("archived")}</span>}
          </div>
          {!item.activeTo&&<Button size="sm" variant="secondary" disabled={busy}
            onClick={()=>void endLink(item)}>{t("unlink")}</Button>}
        </li>)}
      </ul>}
    <p className="text-xs text-muted">{t("notShared")}</p>
    {error&&<p role="alert" className="text-sm text-error">{error}</p>}
    {notice&&<p role="status" className="text-sm">{notice}</p>}
    <form onSubmit={link} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">{t("contactDetail")}
        <select className={inputClass} value={contactId} onChange={e=>setContactId(e.target.value)} required>
          <option value="">{t("noContactSelected")}</option>
          {available.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}
        </select>
      </label>
      <label className="text-sm">{t("relationship")}
        <input className={inputClass} value={relationship} onChange={e=>setRelationship(e.target.value)}
          maxLength={80} required/>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={guardian} onChange={e=>setGuardian(e.target.checked)}/>
        {t("legalGuardian")}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={messages} onChange={e=>setMessages(e.target.checked)}/>
        {t("mayMessage")}
      </label>
      <div className="sm:col-span-2"><Button type="submit" disabled={busy||!contactId||!relationship.trim()}>
        {busy?t("saving"):t("linkContact")}
      </Button></div>
    </form>
  </Card>;
}
