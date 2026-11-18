import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-contact-identity website/MCP create, read, revision, replay and safe disclosure",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const email="synth-"+randomUUID()+"@example.com";
  const created=await page.request.post("/api/contacts",{data:{
    displayName:"Grandmother "+randomUUID(),email,phone:"+972555000000",
    kind:"person",preferredLocale:"he",idempotencyKey:randomUUID(),
  }});
  expect(created.status(),await created.text()).toBe(201);
  const contact=await created.json() as {id:string;displayName:string;revision:number};
  expect(contact.revision).toBe(1);
  const list=await call("ccp_contacts_list",{});
  expect(list.error).toBeUndefined();
  const listed=list.data.find((x:{id:string})=>x.id===contact.id);
  expect(listed.displayName).toBe(contact.displayName);
  expect(listed.email).toBeUndefined();
  const safe=await call("ccp_contacts_detail",{contactId:contact.id});
  expect(safe.data.email).toBeUndefined();
  const detail=await call("ccp_contacts_detail",{contactId:contact.id,
    includeDetails:true,confirmed:true});
  expect(detail.error).toBeUndefined();
  expect(detail.data).toMatchObject({email,phone:"+972555000000",preferredLocale:"he"});
  const updateKey=randomUUID();
  const updated=await call("ccp_contacts_update",{
    contactId:contact.id,expectedRevision:1,idempotencyKey:updateKey,
    displayName:"Grandmother, main contact",
    confirmed:true,
  });
  expect(updated.error).toBeUndefined();
  expect(updated.data).toMatchObject({displayName:"Grandmother, main contact",
    revision:2,replayed:false});
  expect(updated.data.email).toBeUndefined();
  const replay=await call("ccp_contacts_update",{
    contactId:contact.id,expectedRevision:1,idempotencyKey:updateKey,
    displayName:"Grandmother, main contact",confirmed:true,
  });
  expect(replay.error).toBeUndefined();
  expect(replay.data.replayed).toBe(true);
  const web=await page.request.get("/api/contacts/"+contact.id);
  expect(web.status(),await web.text()).toBe(200);
  expect(await web.json()).toMatchObject({revision:2,
    displayName:"Grandmother, main contact",email});
  const stale=await page.request.patch("/api/contacts/"+contact.id,{data:{
    displayName:"Stale edit",expectedRevision:1,idempotencyKey:randomUUID(),
  }});
  expect(stale.status()).toBe(409);
  const unauthorized=await call("ccp_contacts_detail",{contactId:randomUUID()});
  expect(unauthorized.error?.code).toBe("NOT_FOUND");
});

test("PARITY:PARITY-contact-links preserve student identity and never grant a payer or portal role",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const student=await call("ccp_students_create",{
    name:"Contact pupil "+randomUUID(),idempotencyKey:randomUUID(),
  });
  expect(student.error).toBeUndefined();
  const studentId=student.data.entityId as string;
  const contact=await call("ccp_contacts_create",{
    displayName:"Contact "+randomUUID(),email:"synthetic-"+randomUUID()+"@example.com",
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(contact.error).toBeUndefined();
  const contactId=contact.data.id as string;
  expect(contact.data.email).toBeUndefined();
  const linkKey=randomUUID();
  const link=await call("ccp_student_contacts_link",{
    studentId,contactId,relationshipLabel:"Grandmother",
    isLegalGuardian:false,mayReceiveMessages:true,emergencyPriority:2,
    idempotencyKey:linkKey,confirmed:true,
  });
  expect(link.error).toBeUndefined();
  expect(link.data).toMatchObject({studentId,contactId,revision:1,
    isLegalGuardian:false,mayReceiveMessages:true,emergencyPriority:2});
  const replay=await call("ccp_student_contacts_link",{
    studentId,contactId,relationshipLabel:"Grandmother",
    isLegalGuardian:false,mayReceiveMessages:true,emergencyPriority:2,
    idempotencyKey:linkKey,confirmed:true,
  });
  expect(replay.error).toBeUndefined();
  expect(replay.data.replayed).toBe(true);
  const web=await page.request.get("/api/students/"+studentId+"/contacts");
  expect(web.status(),await web.text()).toBe(200);
  expect((await web.json()).filter((x:{id:string})=>x.id===link.data.id)).toHaveLength(1);
  const model=await call("ccp_student_contacts_list",{studentId});
  expect(model.error).toBeUndefined();
  expect(model.data.some((x:{id:string})=>x.id===link.data.id)).toBe(true);
  const unlinkKey=randomUUID();
  const unlinked=await page.request.delete("/api/students/"+studentId+"/contacts/"+link.data.id,{
    data:{expectedRevision:1,idempotencyKey:unlinkKey},
  });
  expect(unlinked.status(),await unlinked.text()).toBe(200);
  expect((await unlinked.json()).revision).toBe(2);
  const replayUnlink=await call("ccp_student_contacts_unlink",{
    studentId,linkId:link.data.id,expectedRevision:1,
    idempotencyKey:unlinkKey,confirmed:true,
  });
  expect(replayUnlink.error).toBeUndefined();
  expect(replayUnlink.data.replayed).toBe(true);
  const history=await call("ccp_student_contacts_list",{studentId});
  expect(history.data.find((x:{id:string})=>x.id===link.data.id).activeTo).toBeTruthy();
  const newLink=await page.request.post("/api/students/"+studentId+"/contacts",{data:{
    contactId,relationshipLabel:"Family friend",isLegalGuardian:false,
    mayReceiveMessages:false,idempotencyKey:randomUUID(),
  }});
  expect(newLink.status(),await newLink.text()).toBe(201);
  expect((await newLink.json()).id).not.toBe(link.data.id);
  const byContact=await call("ccp_contacts_links_list",{contactId});
  expect(byContact.error).toBeUndefined();
  const byBrowser=await page.request.get("/api/contacts/"+contactId+"/links");
  expect(byBrowser.status(),await byBrowser.text()).toBe(200);
  expect(byBrowser.json()).resolves.toEqual(byContact.data);
  const noContact=await call("ccp_students_create",{
    name:"Independent adult "+randomUUID(),idempotencyKey:randomUUID(),
  });
  expect(noContact.error).toBeUndefined();
  const noLinks=await call("ccp_student_contacts_list",{studentId:noContact.data.entityId});
  expect(noLinks.error).toBeUndefined();
  expect(noLinks.data).toEqual([]);
});

test("PARITY:PARITY-billing-account-identity is separate from contacts and cannot invoice by itself",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const contact=await call("ccp_contacts_create",{
    displayName:"Sponsor "+randomUUID(),kind:"organization",
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(contact.error).toBeUndefined();
  const payer=await page.request.post("/api/billing-accounts",{data:{
    displayName:"Sponsoring academy "+randomUUID(),accountKind:"organization",
    contactId:contact.data.id,idempotencyKey:randomUUID(),
  }});
  expect(payer.status(),await payer.text()).toBe(201);
  const account=await payer.json() as {id:string;displayName:string;revision:number};
  const listing=await call("ccp_billing_accounts_list",{});
  expect(listing.error).toBeUndefined();
  expect(listing.data.some((x:{id:string})=>x.id===account.id)).toBe(true);
  const safe=await call("ccp_billing_accounts_detail",{billingAccountId:account.id});
  expect(safe.data.contactId).toBeUndefined();
  const full=await call("ccp_billing_accounts_detail",{
    billingAccountId:account.id,includeContact:true,confirmed:true,
  });
  expect(full.data.contactId).toBe(contact.data.id);
  const requestId=randomUUID();
  const updated=await call("ccp_billing_accounts_update",{
    billingAccountId:account.id,displayName:"Revised sponsor",
    expectedRevision:1,idempotencyKey:requestId,confirmed:true,
  });
  expect(updated.error).toBeUndefined();
  expect(updated.data).toMatchObject({revision:2,displayName:"Revised sponsor"});
  expect(updated.data.contactId).toBeUndefined();
  const replay=await call("ccp_billing_accounts_update",{
    billingAccountId:account.id,displayName:"Revised sponsor",
    expectedRevision:1,idempotencyKey:requestId,confirmed:true,
  });
  expect(replay.data.replayed).toBe(true);
  const web=await page.request.get("/api/billing-accounts/"+account.id);
  expect(web.status(),await web.text()).toBe(200);
  expect(await web.json()).toMatchObject({displayName:"Revised sponsor",
    contactId:contact.data.id});
  const another=await call("ccp_billing_accounts_create",{
    displayName:"Separate payer "+randomUUID(),accountKind:"person",
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(another.error).toBeUndefined();
  expect(another.data.contactId).toBeUndefined();
  const browserUpdate=await page.request.patch("/api/billing-accounts/"+another.data.id,{
    data:{status:"archived",expectedRevision:1,idempotencyKey:randomUUID()},
  });
  expect(browserUpdate.status(),await browserUpdate.text()).toBe(200);
  expect((await browserUpdate.json()).status).toBe("archived");
});

test("PARITY:PARITY-contact-ui shows an MCP-created contact in the localized teacher website",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const name="Coach contact "+randomUUID();
  const created=await call("ccp_contacts_create",{
    displayName:name,kind:"person",idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(created.error).toBeUndefined();
  await page.goto("/families");
  await page.locator('a[href="/contacts"]').click();
  await page.waitForURL("**/contacts");
  await expect(page.locator("h1")).toHaveText(/Contacts/);
  await expect(page.getByText(name)).toBeVisible();
  await page.getByText(name).click();
  await expect(page.getByLabel("Display name")).toHaveValue(name);
  await expect(page.getByText("Linking a contact does not share private teaching notes, grant portal access or make this person a payer.")).toBeVisible();
});

test("PARITY:PARITY-contact-safety archived contact cannot be newly linked, existing history survives",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const contact=await call("ccp_contacts_create",{
    displayName:"Archive contact "+randomUUID(),idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(contact.error).toBeUndefined();
  const student=await call("ccp_students_create",{
    name:"Archive student "+randomUUID(),idempotencyKey:randomUUID(),
  });
  expect(student.error).toBeUndefined();
  const studentId=student.data.entityId as string;
  const linked=await call("ccp_student_contacts_link",{
    studentId,contactId:contact.data.id,relationshipLabel:"Tutor",
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(linked.error).toBeUndefined();
  const archived=await call("ccp_contacts_update",{
    contactId:contact.data.id,status:"archived",expectedRevision:1,
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(archived.error).toBeUndefined();
  expect(archived.data.status).toBe("archived");
  const blocked=await page.request.post("/api/students/"+studentId+"/contacts",{
    data:{contactId:contact.data.id,relationshipLabel:"New tutor",
      idempotencyKey:randomUUID()},
  });
  expect(blocked.status()).toBe(409);
  expect((await blocked.json()).code).toBe("CONTACT_ARCHIVED");
  const history=await call("ccp_contacts_links_list",{contactId:contact.data.id});
  expect(history.error).toBeUndefined();
  expect(history.data.some((row:{id:string})=>row.id===linked.data.id)).toBe(true);
  const other=await call("ccp_students_create",{
    name:"Other teacher-owned student "+randomUUID(),idempotencyKey:randomUUID(),
  });
  expect(other.error).toBeUndefined();
  const cross=await call("ccp_student_contacts_link",{
    studentId:other.data.entityId,contactId:contact.data.id,
    relationshipLabel:"Relative",idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(cross.error?.code).toBe("CONTACT_ARCHIVED");
});

test("PARITY:PARITY-contact-safety requires explicit MCP confirmation and optimistic concurrency",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const name="Consent contact "+randomUUID();
  const unconfirmed=await call("ccp_contacts_create",{
    displayName:name,idempotencyKey:randomUUID(),
  });
  expect(unconfirmed.error).toBeDefined();
  const created=await call("ccp_contacts_create",{
    displayName:name,idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(created.error).toBeUndefined();
  const contactId=created.data.id as string;
  const first=await call("ccp_contacts_update",{
    contactId,expectedRevision:1,idempotencyKey:randomUUID(),
    displayName:name+" updated",confirmed:true,
  });
  expect(first.error).toBeUndefined();
  const stale=await call("ccp_contacts_update",{
    contactId,expectedRevision:1,idempotencyKey:randomUUID(),
    displayName:name+" stale",confirmed:true,
  });
  expect(stale.error?.code).toBe("STALE_REVISION");
  const read=await page.request.get("/api/contacts/"+contactId);
  expect(read.status()).toBe(200);
  expect((await read.json()).displayName).toBe(name+" updated");
});
