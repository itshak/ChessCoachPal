"use client";
import { useCallback, useEffect, useState } from "react";
import {useLocale,useTranslations} from "next-intl";
type Grant = { id:string;client_id:string;scopes:string;created_at:string };
export function AgentConnections() {
  const t=useTranslations("agentConnections"),locale=useLocale();
  const [rows,setRows]=useState<Grant[]>([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState("");
  const reload=useCallback(async()=>{
    try {
      const r=await fetch("/api/agent/connections",{cache:"no-store"});
      if (!r.ok) throw Error(t("loadFailed"));
      const data=await r.json();
      setRows(data.connections ?? []);
      setError("");
    } catch {setError(t("loadFailed"));}
  },[t]);
  useEffect(()=>{void reload();},[reload]);
  async function revoke(id:string) {
    if (!window.confirm(t("revokeConfirm"))) return;
    setBusy(id);
    try {
      const r=await fetch("/api/agent/connections",{
        method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id}),
      });
      if (!r.ok) throw Error(t("revokeFailed"));
      await reload();
    } catch {setError(t("revokeFailedRetry"));}
    finally {setBusy("");}
  }
  return <section className="space-y-4" aria-label={t("title")}>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {!rows.length && !error && <p>{t("empty")}</p>}
    {rows.map(row=><div className="p-4 border rounded" key={row.id}>
      <p className="font-medium">{t("client")} <bdi dir="ltr">{row.client_id.slice(0,16)}…</bdi></p>
      <p>{t("permissions")} <bdi dir="ltr">{row.scopes}</bdi></p>
      <p>{t("connected",{date:new Date(row.created_at).toLocaleDateString(locale)})}</p>
      <button className="underline mt-2" disabled={busy===row.id} onClick={()=>void revoke(row.id)}>{t("revoke")}</button>
    </div>)}
  </section>;
}
