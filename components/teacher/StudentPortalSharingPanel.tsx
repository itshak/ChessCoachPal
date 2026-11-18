"use client";

import {useCallback,useEffect,useState,type FormEvent} from "react";
import {useTranslations} from "next-intl";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import type {PortalGrantPermission} from "@/lib/server/portal-grant-schemas";

type Contact={id:string;displayName:string;status:string};
type Link={contactId:string;activeTo:string|null};
type Payer={id:string;displayName:string;status:string};
type Workplace={id:string;name:string};
type Grant={id:string;contactId:string;studentId:string;workplaceId:string;
  billingAccountId:string|null;permissions:PortalGrantPermission[];expiresAt:string;
  revokedAt:string|null;issued:boolean;revision:number;createdAt:string};
const kinds:[PortalGrantPermission,...PortalGrantPermission[]]=[
  "calendar","cancel","shared_notes","event_rsvp","finance",
];
const field="w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground";

/** The teacher approves one exact contact × student × workplace grant. */
export function StudentPortalSharingPanel({studentId,workplaces}:{studentId:string;workplaces:Workplace[]}){
  const t=useTranslations("portalSharing");
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [links,setLinks]=useState<Link[]>([]);
  const [payers,setPayers]=useState<Payer[]>([]);
  const [grants,setGrants]=useState<Grant[]>([]);
  const [contactId,setContactId]=useState("");
  const [workplaceId,setWorkplaceId]=useState("");
  const [billingAccountId,setBillingAccountId]=useState("");
  const [permissions,setPermissions]=useState<PortalGrantPermission[]>(["calendar"]);
  const [days,setDays]=useState(30);
  const [secretUrl,setSecretUrl]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const reload=useCallback(async()=>{
    try{
      const urls=["/api/contacts","/api/students/"+studentId+"/contacts",
        "/api/billing-accounts","/api/portal-grants?studentId="+studentId];
      const results=await Promise.all(urls.map(url=>fetch(url,{cache:"no-store"})));
      if(results.some(x=>!x.ok))throw Error("LOAD_FAILED");
      const [c,l,p,g]=await Promise.all(results.map(r=>r.json()));
      setContacts(c as Contact[]);setLinks(l as Link[]);setPayers(p as Payer[]);
      setGrants(g as Grant[]);setError("");
    }catch{setError(t("loadFailed"));}finally{setLoading(false);}
  },[studentId,t]);
  useEffect(()=>{void reload();},[reload]);
  const allowedContacts=contacts.filter(contact=>contact.status==="active"&&
    links.some(l=>l.contactId===contact.id&&!l.activeTo));
  const availablePayers=payers.filter(p=>p.status==="active");
  const finance=permissions.includes("finance");
  const contactName=(id:string)=>contacts.find(x=>x.id===id)?.displayName??id;
  const placeName=(id:string)=>workplaces.find(x=>x.id===id)?.name??id;
  function toggle(permission:PortalGrantPermission){
    setPermissions(prev=>prev.includes(permission)?prev.filter(x=>x!==permission):[...prev,permission]);
    setSecretUrl("");
  }
  async function createGrant(event:FormEvent){
    event.preventDefault();
    if(busy||!contactId||!workplaceId||permissions.length===0||finance&&!billingAccountId)return;
    if(!window.confirm(t("confirmCreate")))return;
    setBusy(true);setError("");setNotice("");setSecretUrl("");
    try{
      const response=await fetch("/api/portal-grants",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({contactId,studentId,workplaceId,
          permissions,billingAccountId:finance?billingAccountId:null,
          expiresAt:new Date(Date.now()+days*86400000).toISOString(),
          idempotencyKey:crypto.randomUUID(),confirmed:true}),
      });
      if(!response.ok)throw Error("SAVE_FAILED");
      await reload();setNotice(t("created"));
    }catch{setError(t("saveFailed"));}finally{setBusy(false);}
  }
  async function issue(grant:Grant){
    if(busy||grant.revokedAt||!window.confirm(t("confirmIssue")))return;
    setBusy(true);setError("");setNotice("");setSecretUrl("");
    try{
      const response=await fetch(`/api/portal-grants/${grant.id}/issue`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({expectedRevision:grant.revision,confirmed:true}),
      });
      if(!response.ok)throw Error("ISSUE_FAILED");
      const data=await response.json() as {url:string};
      setSecretUrl(data.url);await reload();setNotice(t("issued"));
    }catch{setError(t("issueFailed"));}finally{setBusy(false);}
  }
  async function revoke(grant:Grant){
    if(busy||grant.revokedAt||!window.confirm(t("confirmRevoke")))return;
    setBusy(true);setError("");setNotice("");setSecretUrl("");
    try{
      const response=await fetch(`/api/portal-grants/${grant.id}`,{
        method:"DELETE",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({expectedRevision:grant.revision,
          idempotencyKey:crypto.randomUUID(),confirmed:true}),
      });
      if(!response.ok)throw Error("REVOKE_FAILED");
      await reload();setNotice(t("revoked"));
    }catch{setError(t("saveFailed"));}finally{setBusy(false);}
  }
  return <Card className="mt-6 space-y-4">
    <div>
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-muted text-sm mt-1">{t("intro")}</p>
    </div>
    {loading?<p className="text-sm text-muted">{t("loading")}</p>:
      grants.length===0?<p className="text-sm text-muted">{t("none")}</p>:
      <ul className="space-y-2">{grants.map(grant=><li key={grant.id}
        className="border-b border-border py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm min-w-0">
          <p><bdi dir="auto">{contactName(grant.contactId)}</bdi> · <bdi dir="auto">{placeName(grant.workplaceId)}</bdi></p>
          <p className="text-xs text-muted mt-1">{grant.permissions.map(kind=>t(kind)).join(", ")}</p>
          <p className="text-xs text-muted mt-1">{t("expires")}: {new Date(grant.expiresAt).toLocaleDateString()}</p>
          {grant.revokedAt&&<p className="text-xs text-error">{t("revoked")}</p>}
        </div>
        {!grant.revokedAt&&<div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={()=>void issue(grant)}>{t("issue")}</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={()=>void revoke(grant)}>{t("revoke")}</Button>
        </div>}
      </li>)}</ul>}
    {secretUrl&&<div className="rounded-lg border border-primary/40 p-3 space-y-2">
      <p className="text-sm font-medium">{t("linkOnce")}</p>
      <input readOnly value={secretUrl} className={field} aria-label={t("secureLink")}/>
      <Button size="sm" variant="secondary" onClick={()=>void navigator.clipboard.writeText(secretUrl)}>{t("copy")}</Button>
      <p className="text-xs text-muted">{t("notSaved")}</p>
    </div>}
    {error&&<p role="alert" className="text-sm text-error">{error}</p>}
    {notice&&<p role="status" className="text-sm">{notice}</p>}
    <form onSubmit={createGrant} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">{t("contact")}
        <select className={field} value={contactId} onChange={e=>setContactId(e.target.value)} required>
          <option value="">{t("chooseContact")}</option>
          {allowedContacts.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}
        </select>
      </label>
      <label className="text-sm">{t("workplace")}
        <select className={field} value={workplaceId} onChange={e=>setWorkplaceId(e.target.value)} required>
          <option value="">{t("chooseWorkplace")}</option>
          {workplaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
      <fieldset className="sm:col-span-2 space-y-2">
        <legend className="text-sm font-medium">{t("permissions")}</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {kinds.map(kind=><label key={kind} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={permissions.includes(kind)} onChange={()=>toggle(kind)}/>
            {t(kind)}
          </label>)}
        </div>
      </fieldset>
      {finance&&<label className="text-sm">{t("payer")}
        <select className={field} value={billingAccountId}
          onChange={e=>setBillingAccountId(e.target.value)} required>
          <option value="">{t("choosePayer")}</option>
          {availablePayers.map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}
        </select>
      </label>}
      <label className="text-sm">{t("duration")}
        <input type="number" min={1} max={365} step={1} className={field}
          value={days} onChange={e=>setDays(Math.min(365,Math.max(1,Number(e.target.value)||1)))}/>
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy||!contactId||!workplaceId||
          permissions.length===0||finance&&!billingAccountId||allowedContacts.length===0}>
          {busy?t("saving"):t("create")}
        </Button>
        {allowedContacts.length===0&&<p className="text-xs text-muted mt-2">{t("linkFirst")}</p>}
      </div>
    </form>
  </Card>;
}
