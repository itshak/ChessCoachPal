"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import {useCallback,useEffect,useState} from "react";
import {useTranslations} from "next-intl";
import {useConfirm} from "@/components/ui/confirm-dialog";

type Connection={
  connected:boolean;username:string|null;scopes:string[];
  canPublish:boolean;connectedAt:string|null;previousRevokeFailed:boolean;
};
type DisconnectResult={
  disconnected:boolean;providerRevoked:boolean|null;
  manualRevokeRequired:boolean;manualRevokeUrl?:string;
};

export function LichessConnectionPanel({returnTo="learning"}:{returnTo?:"learning"|"account"}){
 const t=useTranslations("lichessConnection");
  const toUserError=useLocalizedApiError();
  const returnSuffix=returnTo==="account"?"&returnTo=account":"";
  const [status,setStatus]=useState<Connection|null>(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const confirmDialog=useConfirm();
  const refresh=useCallback(async()=>{
    const res=await fetch("/api/lichess/connection",{cache:"no-store"});
    if(!res.ok)throw new Error(t("permissionsFailed"));
    setStatus(await res.json() as Connection);
  },[t]);
  useEffect(()=>{void refresh().catch(e=>setError(String(e)));},[refresh]);

  async function disconnect(){
    const approved=await confirmDialog({
      title:t("disconnectTitle"),
      message:t("disconnectWarning"),
      confirmLabel:t("disconnectConfirm"),variant:"danger",
    });
    if(!approved)return;
    setBusy(true);setError("");setNotice("");
    try{
      const res=await fetch("/api/lichess/connection",{
        method:"DELETE",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({confirmed:true}),
      });
      if(!res.ok)throw new Error((await res.json()).error??t("disconnectFailed"));
      const result=await res.json() as DisconnectResult;
      setNotice(result.manualRevokeRequired?
        t("manualRevoke"):t("disconnected"));
      await refresh();
    }catch(e){setError(toUserError(e, t("disconnectFailed")));}
    finally{setBusy(false);}
  }
  const params=typeof window!=="undefined"?new URLSearchParams(window.location.search):null;
  const redirectResult=params?.get("lichess");
  return <section aria-label={t("aria")} className="rounded-xl border border-border bg-surface p-4 space-y-3">
    <h2 className="text-xl font-semibold">{t("title")}</h2>
    <p className="text-sm text-muted">
      {t("description")}
    </p>
    {redirectResult==="connected"&&
      <p role="status" className="text-success">{t("connectedNotice")}</p>}
    {redirectResult==="permission-denied"&&
      <p role="alert" className="text-error">{t("permissionDenied")}</p>}
    {redirectResult==="connection-failed"&&
      <p role="alert" className="text-error">{t("authorizationFailed")}</p>}
    {error&&<p role="alert" className="text-error">{error}</p>}
    {notice&&<p role="status" className="text-success">{notice}</p>}
    {!status?<p className="text-sm text-muted">{t("loading")}</p>:
      status.connected?<div className="space-y-2">
        <p className="text-sm">{t("connectedAs")} <strong dir="ltr">{status.username}</strong></p>
        <p className="text-sm text-muted">{t("scopes")} <bdi dir="ltr">{status.scopes.join(", ")}</bdi></p>
        {status.previousRevokeFailed&&<p role="alert" className="text-error">
          {t("previousRevokeFailed")}
        </p>}
        <div className="flex flex-wrap items-center gap-3">
          {!status.canPublish&&
            <a className="text-primary underline text-sm" href={`/api/lichess/connect?mode=write${returnSuffix}`}>
              {t("enablePublishing")}
            </a>}
          <button type="button" disabled={busy} onClick={()=>void disconnect()}
            className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50">
            {t("disconnect")}
          </button>
          <a className="text-primary underline text-sm" href="https://lichess.org/account/oauth/token"
            target="_blank" rel="noreferrer">{t("reviewPermissions")}</a>
        </div>
      </div>:<a className="inline-block rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
        href={`/api/lichess/connect?mode=read${returnSuffix}`}>{t("connectRead")}</a>}
  </section>;
}
