import {randomUUID} from "node:crypto";
import {expect} from "@playwright/test";
import {isolatedTeacherTest as test} from "./helpers/isolated-teacher";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-professional-period-end-review finds fixed unposted amounts without approving them",async({page,request,isolatedTeacher})=>{
 const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
 const confirm=()=>({idempotencyKey:randomUUID(),confirmed:true as const});
 const run=async(name:string,args:Record<string,unknown>)=>{
  const result=await call(name,args);
  expect(result.error,name).toBeUndefined();
  return result.data;
 };
 const makeVenue=async(name:string)=>String((await run("ccp_workplaces_create",{
  name:name+" "+randomUUID(),timezone:"Asia/Jerusalem",currency:"ILS",locale:"en",policy:{},idempotencyKey:randomUUID(),
 })).entityId);
 const workplaceId=await makeVenue("Synthetic fixed approval"),otherVenue=await makeVenue("Irrelevant venue");
 const payer=async(name:string)=>String((await run("ccp_billing_accounts_create",{
  displayName:name+" "+randomUUID(),accountKind:"organization",...confirm(),
 })).id);
 const billingAccountId=await payer("Synthetic payer"),otherPayer=await payer("Irrelevant payer");
 const monthStart="2048-02-01",monthEnd="2048-02-29";
 const makeTerm=(venue:string,account:string,effectiveFrom=monthStart,effectiveTo=monthEnd)=>run(
  "ccp_compensation_agreements_create",{workplaceId:venue,billingAccountId:account,model:"fixed_period",
   rateCents:60000,currency:"ILS",effectiveFrom,effectiveTo,agreementRole:"coach_earning",...confirm()});
 const term=await makeTerm(workplaceId,billingAccountId);
 await makeTerm(workplaceId,billingAccountId,"2048-03-02","2048-03-31");
 await makeTerm(otherVenue,otherPayer);
 const tool="ccp_finance_period_end_review", scope={workplaceId,monthStart,currency:"ILS"};
 const path=(args:Record<string,string>)=>"/api/finance-ledger/period-end-review?"+new URLSearchParams(args);
 expect((await call.listTools()).some(entry=>entry.name===tool)).toBe(true);
 const before=await run("ccp_finance_ledger_list",{});
 const http=await page.request.get(path(scope));
 expect(http.status(),await http.text()).toBe(200);
 expect(http.headers()["cache-control"]).toBe("no-store");
 const result=await run(tool,scope);
 expect(result).toEqual(await http.json());
 expect(result).toEqual({...scope,monthEnd,billingAccountId:null,reviewBasis:"fixed_period_only",
  approvalRequired:true,snapshot:"advisory",items:[{agreementId:term.id,billingAccountId,
   revision:term.revision,proposedCents:60000,reviewStatus:"review_required"}]});
 expect((await run(tool,{...scope,billingAccountId:otherPayer})).items).toEqual([]);
 expect((await run(tool,{...scope,currency:"USD"})).items).toEqual([]);
 expect((await run(tool,{...scope,monthStart:"2048-03-01"})).items).toEqual([]);
 expect((await call(tool,{...scope,workplaceId:randomUUID()})).error?.code).toBe("PERIOD_END_REVIEW_SCOPE_NOT_OWNED");
 expect((await call(tool,{...scope,billingAccountId:randomUUID()})).error?.code).toBe("PERIOD_END_REVIEW_SCOPE_NOT_OWNED");
 expect((await request.get(path(scope))).status()).toBe(401);
 expect((await page.request.get(path(scope)+"&currency=USD")).status()).toBe(400);

 await page.setViewportSize({width:320,height:780});
 await page.goto("/billing");
 await page.getByRole("button",{name:"Review month-end settlement"}).click();
 const panel=page.getByRole("region",{name:"Month-end settlement"});
 await panel.getByLabel("Workplace").selectOption(workplaceId);
 await panel.getByLabel("Obligation month").fill("2048-02");
 await panel.getByLabel("Currency").fill("ILS");
 await panel.getByRole("button",{name:"Review unposted fixed compensation"}).focus();
 await page.keyboard.press("Enter");
 const review=panel.getByRole("region",{name:"Fixed compensation to review"});
 await expect(review.getByText(/ILS\s+600\.00/)).toBeVisible();
 await review.getByRole("button",{name:"Open approval for agreement "+term.id.slice(0,8)}).focus();
 await page.keyboard.press("Enter");
 const approval=page.locator("select").filter({has:page.locator('option[value="'+term.id+'"]')}).last();
 await expect(approval).toHaveValue(term.id);
 await expect(approval).toBeFocused();
 expect(await run("ccp_finance_ledger_list",{})).toEqual(before);

 await run("ccp_finance_obligation_approve",{agreementId:term.id,expectedRevision:term.revision,
  expectedAmountCents:60000,sessionId:null,studentId:null,periodStart:monthStart,periodEnd:monthEnd,...confirm()});
 expect((await run(tool,scope)).items).toEqual([]);
});
