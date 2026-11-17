"use client";

import { useState } from "react";
import {useTranslations} from "next-intl";
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
  const t=useTranslations("studentRemove");
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
        showToast(impact?.error??t("reviewFailed"),"error");
        return;
      }
      if(!impact.canDelete){
        const refs=Object.entries(impact.blockers as Record<string,number>)
          .filter(([,count])=>count>0).map(([name,count])=>name+": "+count).join(", ");
        showToast(t("linkedHistory",{refs}),"error");
        return;
      }
      setRevision(impact.updatedAt);
      setConfirmOpen(true);
    }catch{
      showToast(t("reviewFailed"),"error");
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
        showToast(err?.error ?? t("removeFailed"), "error");
        setRemoving(false);
        return;
      }
      router.push("/students");
      router.refresh();
    } catch {
      showToast(t("removeFailed"), "error");
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
        {t("removeStudent")}
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
            <h3 className="font-semibold text-lg mb-1">{t("confirmTitle")}</h3>
            <p className="text-muted text-sm mb-4">
              {t("confirmWarning",{name:studentName})}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmOpen(false)}
                disabled={removing}
              >
                {t("cancel")}
              </Button>
              <Button
                variant="error"
                size="sm"
                onClick={handleRemove}
                disabled={removing}
              >
                {removing?t("removing"):t("remove")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
