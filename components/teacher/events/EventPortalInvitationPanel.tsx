"use client";
import {useCallback,useEffect,useState} from "react";
import {useTranslations} from "next-intl";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";

type Contact={id:string;displayName:string};
type Grant={id:string;contactId:string;studentId:string;workplaceId:string;
  permissions:string[];revokedAt:string|null;expiresAt:string};
type Invite={id:string;portalGrantId:string;status:string;partySize:number|null;
  revokedAt:string|null;revision:number};
const selectClass="w-full max-w-md min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground";
/** Teachers approve exactly one contact/workplace/student/event invitation. */
export function EventPortalInvitationPanel({eventId,workplaceId,studentIds}:{
  eventId:string;workplaceId:string|null;studentIds:string[];
}){
  const t=useTranslations("eventPortalInvites");
  const [grants,setGrants]=useState<Grant[]>([]);
  const [invites,setInvites]=useState<Invite[]>([]);
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [grantId,setGrantId]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const reload=useCallback(async()=>{
    try{
      const responses=await Promise.all([
        fetch("/api/portal-grants",{cache:"no-store"}),
        fetch(`/api/events/${eventId}/portal-invitations`,{cache:"no-store"}),
        fetch("/api/contacts",{cache:"no-store"}),
      ]);
      if(responses.some(r=>!r.ok))throw Error("FETCH_FAILED");
      const [gs,is,cs]=await Promise.all(responses.map(r=>r.json()));
      setGrants(gs as Grant[]);setInvites(is as Invite[]);setContacts(cs as Contact[]);
      setError("");
    }catch{setError(t("loadFailed"));}finally{setLoading(false);}
  },[eventId,t]);
  useEffect(()=>{void reload();},[reload]);
  const eligible=grants.filter(g=>g.workplaceId===workplaceId&&
    studentIds.includes(g.studentId)&&g.permissions.includes("event_rsvp")&&
    !g.revokedAt&&new Date(g.expiresAt).getTime()>Date.now()&&
    !invites.some(i=>i.portalGrantId===g.id&&!i.revokedAt));
  const contactName=(id:string)=>{
    const grant=grants.find(g=>g.id===id);
    return contacts.find(c=>c.id===grant?.contactId)?.displayName??t("unknownContact");
  };
  async function create(){
    if(busy||!grantId||!window.confirm(t("confirmInvite")))return;
    setBusy(true);setError("");setNotice("");
    try{
      const r=await fetch(`/api/events/${eventId}/portal-invitations`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({portalGrantId:grantId,idempotencyKey:crypto.randomUUID(),confirmed:true}),
      });
      if(!r.ok)throw Error("CREATE_FAILED");
      setGrantId("");await reload();setNotice(t("created"));
    }catch{setError(t("saveFailed"));}finally{setBusy(false);}
  }
  async function revoke(invite:Invite){
    if(busy||invite.revokedAt||!window.confirm(t("confirmRevoke")))return;
    setBusy(true);setError("");setNotice("");
    try{
      const r=await fetch(`/api/events/${eventId}/portal-invitations/${invite.id}`,{
        method:"DELETE",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({expectedRevision:invite.revision,
          idempotencyKey:crypto.randomUUID(),confirmed:true}),
      });
      if(!r.ok)throw Error("REVOKE_FAILED");
      await reload();setNotice(t("revoked"));
    }catch{setError(t("saveFailed"));}finally{setBusy(false);}
  }
  return <Card className="space-y-4">
    <div>
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted mt-1">{t("intro")}</p>
    </div>
    {!workplaceId?<p className="text-sm text-muted">{t("assignWorkplace")}</p>:<>
      {loading?<p className="text-sm text-muted">{t("loading")}</p>:
        invites.length===0?<p className="text-sm text-muted">{t("none")}</p>:
          <ul className="space-y-2">{invites.map(i=><li key={i.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm">
            <div>
              <span><bdi dir="auto">{contactName(i.portalGrantId)}</bdi></span>
              {" · "}<span className="text-muted">{i.status}</span>
              {i.partySize!=null&&<span className="text-muted"> · {i.partySize}</span>}
              {i.revokedAt&&<span className="ms-2 text-error">{t("revoked")}</span>}
            </div>
            {!i.revokedAt&&<Button size="sm" variant="secondary" disabled={busy}
              onClick={()=>void revoke(i)}>{t("revoke")}</Button>}
          </li>)}</ul>}
      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-2">
        <label className="text-sm flex-1">{t("contactGrant")}
          <select className={selectClass} value={grantId} onChange={e=>setGrantId(e.target.value)}>
            <option value="">{t("chooseGrant")}</option>
            {eligible.map(g=><option key={g.id} value={g.id}>
              {contactName(g.id)}
            </option>)}
          </select>
        </label>
        <Button disabled={busy||!grantId} onClick={()=>void create()}>{t("invite")}</Button>
      </div>
      {eligible.length===0&&<p className="text-xs text-muted">{t("firstGrant")}</p>}
    </>}
    {error&&<p role="alert" className="text-sm text-error">{error}</p>}
    {notice&&<p role="status" className="text-sm">{notice}</p>}
  </Card>;
}
