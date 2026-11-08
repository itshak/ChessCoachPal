"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Props = {
  studentId:string;
  initialAliases:string[];
  initialStrength:number|null;
  initialLichessUsername:string|null;
  initialChesscomUsername:string|null;
  initialLichessRating:number|null;
  initialChesscomRating:number|null;
};
export function StudentChessProfileEditor(props:Props) {
  const router=useRouter();
  const [aliases,setAliases]=useState(props.initialAliases.join(", "));
  const [strength,setStrength]=useState(props.initialStrength?.toString() ?? "");
  const [lichess,setLichess]=useState(props.initialLichessUsername ?? "");
  const [chesscom,setChesscom]=useState(props.initialChesscomUsername ?? "");
  const [lichessRating,setLichessRating]=useState(props.initialLichessRating?.toString() ?? "");
  const [chesscomRating,setChesscomRating]=useState(props.initialChesscomRating?.toString() ?? "");
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const rating=(value:string)=>value.trim()?Number(value):null;
  async function save(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();setSaving(true);setError("");
    try {
      const res=await fetch(`/api/students/${props.studentId}`,{
        method:"PUT",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          nameAliases:aliases.split(",").map(x=>x.trim()).filter(Boolean),
          strength:strength?Number(strength):null,
          lichessUsername:lichess.trim()||null,chesscomUsername:chesscom.trim()||null,
          lichessRating:rating(lichessRating),chesscomRating:rating(chesscomRating),
        }),
      });
      if (!res.ok) {
        const data=await res.json().catch(()=>null);
        setError(data?.error ?? "Unable to save chess profile");return;
      }
      router.refresh();
    } catch {
      setError("Unable to save chess profile");
    } finally {setSaving(false);}
  }
  const field="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
  return <Card padding="sm" className="mb-6">
    <form onSubmit={save} className="space-y-3">
      <div>
        <h2 className="font-semibold">Chess profile</h2>
        <p className="text-xs text-muted">Teacher-entered ratings are not verified against chess platforms.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm">Name aliases (comma-separated, Hebrew or English)
          <input className={field} value={aliases} onChange={e=>setAliases(e.target.value)}
            maxLength={2400} placeholder="Short name, English spelling" />
        </label>
        <label className="text-sm">Teacher-assessed strength (1–10)
          <select className={field} value={strength} onChange={e=>setStrength(e.target.value)}>
            <option value="">Not assessed</option>
            {Array.from({length:10},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}
          </select>
        </label>
        <label className="text-sm">Lichess username
          <input className={field} value={lichess} onChange={e=>setLichess(e.target.value)} maxLength={30} />
        </label>
        <label className="text-sm">Chess.com username
          <input className={field} value={chesscom} onChange={e=>setChesscom(e.target.value)} maxLength={30} />
        </label>
        <label className="text-sm">Lichess rating (teacher-recorded)
          <input type="number" className={field} value={lichessRating} onChange={e=>setLichessRating(e.target.value)}
            min={100} max={4000} placeholder="Not recorded" />
        </label>
        <label className="text-sm">Chess.com rating (teacher-recorded)
          <input type="number" className={field} value={chesscomRating} onChange={e=>setChesscomRating(e.target.value)}
            min={100} max={4000} placeholder="Not recorded" />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <Button type="submit" disabled={saving}>{saving?"Saving…":"Save chess profile"}</Button>
    </form>
  </Card>;
}
