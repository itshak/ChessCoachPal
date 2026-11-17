import {getTranslations,getLocale} from "next-intl/server";
import {Card} from "@/components/ui/card";
import type {StudioPolicy} from "@/lib/schedule";

/** Policy flags stay canonical; only human summary labels change language. */
export async function StudioPoliciesSection({policy}:{policy:StudioPolicy}){
  const t=await getTranslations("portal"),locale=await getLocale();
  const earned:string[]=[],notEarned:string[]=[],billed:string[]=[],notBilled:string[]=[];
  const makeup=(label:string,flag:boolean)=>(flag?earned:notEarned).push(label);
  const billing=(label:string,flag:boolean)=>(flag?billed:notBilled).push(label);

  makeup(t("policyTimely"),policy.timely_cancel_earns_makeup);
  makeup(t("policyLate"),policy.late_cancel_earns_makeup);
  makeup(t("policyNoShow"),policy.no_show_earns_makeup);
  makeup(t("policyTeacherCancelled"),policy.teacher_cancel_earns_makeup);
  billing(t("policyAttended"),policy.bill_attended);
  billing(t("policyMissed"),policy.bill_no_show);
  billing(t("policyLateCancel"),policy.bill_late_student_cancel);
  billing(t("policyTimelyCancel"),policy.bill_timely_student_cancel);
  billing(t("policyTeacherCancelled"),policy.bill_teacher_cancel);
  billing(t("policyMakeupLesson"),policy.bill_makeup);

  const makeupLines=[
    ...(earned.length?[t("policyEarns",{reasons:earned.join(t("policyListSeparator"))})]:[]),
    ...(notEarned.length?[t("policyNotEarns",{reasons:notEarned.join(t("policyListSeparator"))})]:[]),
    ...(earned.length?[policy.makeup_credit_expiry_days!=null?
      t("policyExpires",{days:policy.makeup_credit_expiry_days}):t("policyNoExpiry")]:[])
  ];
  const billingLines=[
    ...(billed.length?[t("policyBilled",{reasons:billed.join(t("policyListSeparator"))})]:[]),
    ...(notBilled.length?[t("policyNotBilled",{reasons:notBilled.join(t("policyListSeparator"))})]:[]),
    policy.invoice_cadence==="monthly"?t("policyMonthly"):t("policyManual"),
    t("policyAskRates")
  ];

  return <section id="studio-policies">
    <h2 className="text-lg font-semibold mb-3">{t("policyTitle")}</h2>
    <Card padding="sm">
      <div className="space-y-4 text-sm">
        <div><h3 className="font-semibold mb-1">{t("policyCancel")}</h3>
          <p className="text-muted">{t("policyCancellationWindow",{hours:policy.cancellation_window_hours})}</p>
        </div>
        <div><h3 className="font-semibold mb-1">{t("policyMakeup")}</h3>
          <ul className="text-muted space-y-0.5 list-disc list-inside">
            {makeupLines.map((line,i)=><li key={i}>{line}</li>)}
          </ul>
        </div>
        <div><h3 className="font-semibold mb-1">{t("policyBilling")}</h3>
          <ul className="text-muted space-y-0.5 list-disc list-inside">
            {billingLines.map((line,i)=><li key={i}>{line}</li>)}
          </ul>
        </div>
        {policy.policies_updated_at&&<p className="text-xs text-muted">
          {t("policyUpdated",{date:new Intl.DateTimeFormat(locale,{
            year:"numeric",month:"long",day:"numeric",timeZone:policy.timezone
          }).format(new Date(policy.policies_updated_at))})}
        </p>}
      </div>
    </Card>
  </section>;
}
