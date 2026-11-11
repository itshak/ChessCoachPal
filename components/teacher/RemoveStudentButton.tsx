"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function RemoveStudentButton({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [revision, setRevision] = useState<string | null>(null);

  async function reviewRemove(){
    setChecking(true);
    try{
      const res=await fetch("/api/students/"+studentId+"?deletePreview=true",{cache:"no-store"});
      const impact=await res.json().catch(()=>null);
      if(!res.ok||!impact){
        showToast(impact?.error??"Could not review deletion impact","error");
        return;
      }
      if(!impact.canDelete){
        const refs=Object.entries(impact.blockers as Record<string,number>)
          .filter(([,count])=>count>0).map(([name,count])=>name+": "+count).join(", ");
        showToast("Student has linked teaching history. Archive instead. "+refs,"error");
        return;
      }
      setRevision(impact.updatedAt);
      setConfirmOpen(true);
    }catch{
      showToast("Could not review deletion impact","error");
    }finally{setChecking(false);}
  }
  async function handleRemove() {
    setRemoving(true);
    try {
      const res = await fetch("/api/students/"+studentId, {
        method:"DELETE",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({confirmed:true,expectedUpdatedAt:revision}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        showToast(err?.error ?? "Failed to remove student", "error");
        setRemoving(false);
        return;
      }
      router.push("/students");
      router.refresh();
    } catch {
      showToast("Failed to remove student", "error");
      setRemoving(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-error hover:bg-error/10 hover:text-error"
        onClick={() => void reviewRemove()}
        disabled={checking || removing}
      >
        Remove student
      </Button>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !removing && setConfirmOpen(false)}
        >
          <div
            className="bg-surface border border-border rounded-xl shadow-lg max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-lg mb-1">Remove student?</h3>
            <p className="text-muted text-sm mb-4">
              &quot;{studentName}&quot; has no linked teaching history. This permanently removes their remaining profile information and cannot be undone. Archive to preserve the record.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmOpen(false)}
                disabled={removing}
              >
                Cancel
              </Button>
              <Button
                variant="error"
                size="sm"
                onClick={handleRemove}
                disabled={removing}
              >
                {removing ? "Removing…" : "Remove"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
