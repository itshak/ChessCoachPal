import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

const origin="http://localhost:3000";
const when=()=>new Date(Date.now()+5*24*60*60*1000).toISOString();

test("PARITY:PARITY-scoped-portal-grants are explicit, redacted, revisioned and revoked across website/MCP",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const student=await call("ccp_students_create",{
    name:"Portal pupil "+randomUUID(),idempotencyKey:randomUUID(),
  });
  expect(student.error).toBeUndefined();
  const studentId=student.data.entityId as string;
  const workplace=await call("ccp_workplaces_create",{
    name:"Portal school "+randomUUID(),timezone:"UTC",currency:"USD",
    locale:"en",policy:{},idempotencyKey:randomUUID(),
  });
  expect(workplace.error).toBeUndefined();
  const workplaceId=workplace.data.entityId as string;
  const enrolled=await call("ccp_workplaces_enroll",{
    studentId,workplaceId,idempotencyKey:randomUUID(),
  });
  expect(enrolled.error).toBeUndefined();
  const contact=await call("ccp_contacts_create",{
    displayName:"Portal mother "+randomUUID(),
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(contact.error).toBeUndefined();
  const contactId=contact.data.id as string;
  const params={studentId,workplaceId,contactId,expiresAt:when(),
    permissions:["calendar","cancel"],billingAccountId:null,
    idempotencyKey:randomUUID(),confirmed:true};

  // A contact list entry MUST NOT automatically confer a sharing grant.
  const premature=await call("ccp_portal_grants_create",params);
  expect(premature.error?.code).toBe("CONTACT_NOT_LINKED");
  const link=await call("ccp_student_contacts_link",{
    studentId,contactId,relationshipLabel:"Mother",isLegalGuardian:true,
    mayReceiveMessages:false,idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(link.error).toBeUndefined();
  const unconfirmed=await call("ccp_portal_grants_create",{
    ...params,idempotencyKey:randomUUID(),confirmed:undefined,
  });
  expect(unconfirmed.error?.code).toBe("VALIDATION_ERROR");
  const created=await page.request.post("/api/portal-grants",{
    headers:{origin},data:params,
  });
  expect(created.status(),await created.text()).toBe(201);
  const grant=await created.json() as {
    id:string;revision:number;replayed:boolean;issued:boolean;permissions:string[];
  };
  expect(grant).toMatchObject({id:params.idempotencyKey,revision:1,
    replayed:false,issued:false,permissions:["calendar","cancel"]});
  const replay=await call("ccp_portal_grants_create",params);
  expect(replay.error).toBeUndefined();
  expect(replay.data.replayed).toBe(true);
  expect(replay.data.secretNotReturned).toBe(true);
  expect(JSON.stringify(replay)).not.toContain("token_digest");
  const siteList=await page.request.get("/api/portal-grants?contactId="+contactId);
  expect(siteList.status(),await siteList.text()).toBe(200);
  const mcpList=await call("ccp_portal_grants_list",{contactId});
  expect(mcpList.error).toBeUndefined();
  expect(mcpList.data).toEqual(await siteList.json());
  expect(mcpList.data.find((g:{id:string})=>g.id===grant.id)).toBeTruthy();
  const siteDetail=await page.request.get("/api/portal-grants/"+grant.id);
  expect(siteDetail.status(),await siteDetail.text()).toBe(200);
  const mcpDetail=await call("ccp_portal_grants_get",{grantId:grant.id});
  expect(mcpDetail.error).toBeUndefined();
  expect(mcpDetail.data).toEqual(await siteDetail.json());
  expect(JSON.stringify(mcpDetail)).not.toMatch(/token_digest|secretNotReturned|"url"/i);

  // Only a browser-approved, same-origin action can reveal the new token ONCE.
  const forbidden=await page.request.post("/api/portal-grants/"+grant.id+"/issue",{
    headers:{origin:"https://other.example.invalid"},data:{expectedRevision:1,confirmed:true},
  });
  expect(forbidden.status()).toBe(403);
  const issued=await page.request.post("/api/portal-grants/"+grant.id+"/issue",{
    headers:{origin},data:{expectedRevision:1,confirmed:true},
  });
  expect(issued.status(),await issued.text()).toBe(200);
  const response=await issued.json() as {url:string;grant:{revision:number;issued:boolean}};
  expect(response.grant).toMatchObject({revision:2,issued:true});
  expect(new URL(response.url).pathname).toMatch(/^\/portal\/[A-Za-z0-9_-]{42,44}$/);
  expect(issued.headers()["cache-control"]).toContain("no-store");
  const afterIssue=await call("ccp_portal_grants_get",{grantId:grant.id});
  expect(afterIssue.data.issued).toBe(true);
  expect(JSON.stringify(afterIssue)).not.toContain(new URL(response.url).pathname.split("/").pop());
  const revoked=await call("ccp_portal_grants_revoke",{
    grantId:grant.id,expectedRevision:2,idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(revoked.error).toBeUndefined();
  expect(revoked.data).toMatchObject({revision:3,issued:false});
  expect(revoked.data.revokedAt).toBeTruthy();
  const siteAfter=await page.request.get("/api/portal-grants/"+grant.id);
  expect((await siteAfter.json()).issued).toBe(false);
  const stale=await page.request.delete("/api/portal-grants/"+grant.id,{
    headers:{origin},data:{expectedRevision:2,idempotencyKey:randomUUID(),confirmed:true},
  });
  expect(stale.status()).toBe(409);
  const wrongTenant=await call("ccp_portal_grants_get",{grantId:randomUUID()});
  expect(wrongTenant.error?.code).toBe("NOT_FOUND");
});

test("PARITY:PARITY-portal-grant-safety excludes payer privilege, arbitrary workplaces and unlinked contacts",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const student=await call("ccp_students_create",{
    name:"Portal student "+randomUUID(),idempotencyKey:randomUUID(),
  });
  const contact=await call("ccp_contacts_create",{
    displayName:"Portal sponsor "+randomUUID(),idempotencyKey:randomUUID(),confirmed:true,
  });
  const workplace=await call("ccp_workplaces_create",{
    name:"Private "+randomUUID(),timezone:"UTC",currency:"USD",locale:"en",
    policy:{},idempotencyKey:randomUUID(),
  });
  expect(student.error).toBeUndefined();
  expect(contact.error).toBeUndefined();
  expect(workplace.error).toBeUndefined();
  const studentId=student.data.entityId as string;
  const contactId=contact.data.id as string;
  const workplaceId=workplace.data.entityId as string;
  await call("ccp_student_contacts_link",{
    studentId,contactId,relationshipLabel:"Sponsor",idempotencyKey:randomUUID(),confirmed:true,
  });
  const input={studentId,contactId,workplaceId,expiresAt:when(),
    permissions:["calendar"],idempotencyKey:randomUUID(),confirmed:true};
  const unenrolled=await call("ccp_portal_grants_create",input);
  expect(unenrolled.error?.code).toBe("NOT_ENROLLED");
  const enrolled=await call("ccp_workplaces_enroll",{
    studentId,workplaceId,idempotencyKey:randomUUID(),
  });
  expect(enrolled.error).toBeUndefined();
  const wrongFinance=await call("ccp_portal_grants_create",{
    ...input,idempotencyKey:randomUUID(),permissions:["calendar","finance"],
  });
  expect(wrongFinance.error?.code).toBe("VALIDATION_ERROR");
  const payer=await call("ccp_billing_accounts_create",{
    displayName:"Grant payer",accountKind:"organization",idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(payer.error).toBeUndefined();
  const validated=await call("ccp_portal_grants_create",{
    ...input,billingAccountId:payer.data.id,permissions:["finance"],idempotencyKey:randomUUID(),
  });
  expect(validated.error).toBeUndefined();
  expect(validated.data.billingAccountId).toBe(payer.data.id);
  expect(validated.data.permissions).toEqual(["finance"]);
});
