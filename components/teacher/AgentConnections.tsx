"use client";
import { useCallback, useEffect, useState } from "react";
type Grant = { id:string;client_id:string;scopes:string;created_at:string };
export function AgentConnections() {
  const [rows,setRows]=useState<Grant[]>([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState("");
  const reload=useCallback(async()=>{
    try {
      const r=await fetch("/api/agent/connections",{cache:"no-store"});
      if (!r.ok) throw Error("Could not load active connections");
      const data=await r.json();
      setRows(data.connections ?? []);
      setError("");
    } catch {setError("Could not load active connections");}
  },[]);
  useEffect(()=>{void reload();},[reload]);
  async function revoke(id:string) {
    if (!window.confirm("Revoke this AI client's access immediately?")) return;
    setBusy(id);
    try {
      const r=await fetch("/api/agent/connections",{
        method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id}),
      });
      if (!r.ok) throw Error("Revocation failed");
      await reload();
    } catch {setError("Revocation failed; try again");}
    finally {setBusy("");}
  }
  return <section className="space-y-4" aria-label="Active AI connections">
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {!rows.length && !error && <p>No active AI client authorizations.</p>}
    {rows.map(row=><div className="p-4 border rounded" key={row.id}>
      <p className="font-medium">Client: {row.client_id.slice(0,16)}…</p>
      <p>Permissions: {row.scopes}</p>
      <p>Connected: {new Date(row.created_at).toLocaleDateString()}</p>
      <button className="underline mt-2" disabled={busy===row.id} onClick={()=>void revoke(row.id)}>Revoke access</button>
    </div>)}
  </section>;
}
