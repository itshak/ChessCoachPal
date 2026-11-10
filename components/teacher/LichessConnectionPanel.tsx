"use client";

import {useCallback,useEffect,useState} from "react";
import {useConfirm} from "@/components/ui/confirm-dialog";

type Connection={
  connected:boolean;username:string|null;scopes:string[];
  canPublish:boolean;connectedAt:string|null;previousRevokeFailed:boolean;
};
type DisconnectResult={
  disconnected:boolean;providerRevoked:boolean|null;
  manualRevokeRequired:boolean;manualRevokeUrl?:string;
};

export function LichessConnectionPanel(){
  const [status,setStatus]=useState<Connection|null>(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const confirmDialog=useConfirm();
  const refresh=useCallback(async()=>{
    const res=await fetch("/api/lichess/connection",{cache:"no-store"});
    if(!res.ok)throw new Error("Could not load Lichess permissions");
    setStatus(await res.json() as Connection);
  },[]);
  useEffect(()=>{void refresh().catch(e=>setError(String(e)));},[refresh]);

  async function disconnect(){
    const approved=await confirmDialog({
      title:"Disconnect Lichess?",
      message:"Revoke the connected Lichess study permission? Existing saved study links will remain.",
      confirmLabel:"Disconnect",variant:"danger",
    });
    if(!approved)return;
    setBusy(true);setError("");setNotice("");
    try{
      const res=await fetch("/api/lichess/connection",{
        method:"DELETE",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({confirmed:true}),
      });
      if(!res.ok)throw new Error((await res.json()).error??"Unable to disconnect");
      const result=await res.json() as DisconnectResult;
      setNotice(result.manualRevokeRequired?
        "Disconnected locally. Lichess did not confirm revocation; revoke the token in your Lichess account.":"Lichess disconnected.");
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:"Unable to disconnect");}
    finally{setBusy(false);}
  }
  const params=typeof window!=="undefined"?new URLSearchParams(window.location.search):null;
  const redirectResult=params?.get("lichess");
  return <section aria-label="Lichess study connection" className="rounded-xl border border-border bg-surface p-4 space-y-3">
    <h2 className="text-xl font-semibold">Lichess study connection</h2>
    <p className="text-sm text-muted">
      Connect only your teacher account. Permissions stay on the secure server and are never revealed to ChatGPT or Claude.
    </p>
    {redirectResult==="connection-failed"&&
      <p role="alert" className="text-error">Lichess authorization failed. No provider credentials were saved.</p>}
    {error&&<p role="alert" className="text-error">{error}</p>}
    {notice&&<p role="status" className="text-success">{notice}</p>}
    {!status?<p className="text-sm text-muted">Loading connection…</p>:
      status.connected?<div className="space-y-2">
        <p className="text-sm">Connected as <strong>{status.username}</strong></p>
        <p className="text-sm text-muted">Permissions: {status.scopes.join(", ")}</p>
        {status.previousRevokeFailed&&<p role="alert" className="text-error">
          A previous Lichess token could not be revoked. Review your active tokens on Lichess.
        </p>}
        <div className="flex flex-wrap items-center gap-3">
          {!status.canPublish&&
            <a className="text-primary underline text-sm" href="/api/lichess/connect?mode=write">
              Enable study publishing (requires separate Lichess consent)
            </a>}
          <button type="button" disabled={busy} onClick={()=>void disconnect()}
            className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50">
            Disconnect Lichess
          </button>
          <a className="text-primary underline text-sm" href="https://lichess.org/account/oauth/token"
            target="_blank" rel="noreferrer">Review Lichess permissions</a>
        </div>
      </div>:<a className="inline-block rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
        href="/api/lichess/connect?mode=read">Connect Lichess studies (read-only)</a>}
  </section>;
}
