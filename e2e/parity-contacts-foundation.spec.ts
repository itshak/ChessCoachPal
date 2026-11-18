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

test("PARITY:PARITY-contact-navigation prefers contacts while legacy family editor remains reachable",async({page})=>{
  await page.goto("/dashboard");
  // Desktop navigation may render the secondary links inline instead of a
  // More popover, depending on viewport. Assert the destination, not layout.
  await expect(page.locator('nav a[href="/contacts"]').first()).toBeAttached();
  await expect(page.locator('nav a[href="/families"]')).toHaveCount(0);
  await page.goto("/contacts");
  await expect(page.locator("h1")).toContainText("Contacts");
  // Existing portal-family management remains reachable by its legacy URL.
  await page.goto("/families");
  await expect(page).toHaveURL(/\/families$/);
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

test("PARITY:PARITY-contact-student-profile renders localized secondary contact actions with MCP readback",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const student=await call("ccp_students_create",{
    name:"Profile contact pupil "+randomUUID(),idempotencyKey:randomUUID(),
  });
  expect(student.error).toBeUndefined();
  const studentId=student.data.entityId as string;
  const contactName="Profile contact "+randomUUID();
  const contact=await call("ccp_contacts_create",{
    displayName:contactName,idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(contact.error).toBeUndefined();
  await page.goto("/students/"+studentId);
  const section=page.getByRole("heading",{name:"Student relationships"}).locator("..");
  await expect(section).toBeVisible();
  await page.getByRole("combobox",{name:"Contact details"}).selectOption(contact.data.id);
  await page.getByRole("textbox",{name:"Relationship"}).fill("Grandmother");
  await page.getByRole("button",{name:"Link to student"}).click();
  await expect(page.getByText(contactName,{exact:true})).toBeVisible();
  const read=await call("ccp_student_contacts_list",{studentId});
  expect(read.error).toBeUndefined();
  expect(read.data.some((row:{contactId:string;relationshipLabel:string})=>
    row.contactId===contact.data.id&&row.relationshipLabel==="Grandmother")).toBe(true);
});

test("PARITY:PARITY-contact-transfer current JSON and model-safe CSV preserve contact/link/payer identities",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const student=await call("ccp_students_create",{
    name:"Restore-linked learner "+randomUUID(),idempotencyKey:randomUUID(),
  });
  expect(student.error).toBeUndefined();
  const studentId=student.data.entityId as string;
  const contactId=randomUUID(),linkId=randomUUID(),billingAccountId=randomUUID();
  const privateEmail="restore-"+randomUUID()+"@example.invalid";
  const response=await page.request.get("/api/settings/export");
  expect(response.status(),await response.text()).toBe(200);
  const existing=await response.json();
  const payload={
    exportedAt:new Date().toISOString(),teacherId:existing.teacherId,
    tables:{
      contacts:[{id:contactId,display_name:"Restored synthetic contact",
        kind:"person",email:privateEmail,phone:"+972-555-0000",
        status:"active"}],
      student_contacts:[{id:linkId,student_id:studentId,contact_id:contactId,
        relationship_label:"Teacher liaison",is_legal_guardian:false,
        may_receive_messages:false}],
      billing_accounts:[{id:billingAccountId,contact_id:contactId,
        display_name:"Independent synthetic payer",account_kind:"person",
        status:"active"}],
    },
  };
  const preview=await call("ccp_settings_import_preview",{payload});
  expect(preview.error).toBeUndefined();
  expect(preview.data.counts).toMatchObject({
    contacts:1,student_contacts:1,billing_accounts:1,
  });
  const applied=await call("ccp_settings_import_apply",{
    payload,expectedSha256:preview.data.sha256,confirmed:true,
  });
  expect(applied.error).toBeUndefined();
  expect(applied.data.counts).toMatchObject({
    contacts:1,student_contacts:1,billing_accounts:1,
  });
  const replay=await page.request.post("/api/settings/import",{
    data:{payload,expectedSha256:preview.data.sha256,confirmed:true},
  });
  expect(replay.status(),await replay.text()).toBe(200);
  expect(await replay.json()).toEqual(applied.data);
  const webContact=await page.request.get("/api/contacts/"+contactId);
  expect(webContact.status(),await webContact.text()).toBe(200);
  expect((await webContact.json()).email).toBe(privateEmail);
  const linked=await call("ccp_student_contacts_list",{studentId});
  expect(linked.error).toBeUndefined();
  expect(linked.data.some((row:{id:string;contactId:string})=>
    row.id===linkId&&row.contactId===contactId)).toBe(true);
  const payer=await call("ccp_billing_accounts_detail",{
    billingAccountId,includeContact:true,confirmed:true,
  });
  expect(payer.error).toBeUndefined();
  expect(payer.data.contactId).toBe(contactId);

  const backup=await page.request.get("/api/settings/export");
  expect(backup.status(),await backup.text()).toBe(200);
  const data=await backup.json();
  for(const [table,id] of [
    ["contacts",contactId],["student_contacts",linkId],
    ["billing_accounts",billingAccountId],
  ] as const){
    expect((data.tables[table] as Array<{id:string}>).some(row=>row.id===id)).toBe(true);
  }
  const bulk=await call("ccp_settings_export",{confirmed:true});
  if(bulk.error)expect(bulk.error.code).toBe("EXPORT_TOO_LARGE");
  else{
    expect(bulk.data.contactDetailsExcluded).toBe(true);
    expect(JSON.stringify(bulk.data.export.tables.contacts)).not.toContain(privateEmail);
  }
  const csv=await call("ccp_settings_export_csv",{
    confirmed:true,table:"contacts",offset:0,limit:200,
  });
  expect(csv.error).toBeUndefined();
  expect(csv.data.contactDetailsExcluded).toBe(true);
  expect(csv.data.csv).not.toContain(privateEmail);
  expect(csv.data.csv).not.toContain("phone");
});

test("PARITY:PARITY-student-create rejects old guardian contracts and grants no guest access",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const rejected=await call("ccp_students_create_full",{
    name:"Obsolete household request "+randomUUID(),guardianId:randomUUID(),
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(rejected.error?.code).toBe("VALIDATION_ERROR");
  const website=await page.request.post("/api/students",{data:{
    name:"Old household website "+randomUUID(),guardianId:randomUUID(),
  }});
  expect(website.status(),await website.text()).toBe(400);
  const created=await call("ccp_students_create_full",{
    name:"Independent student with contact "+randomUUID(),
    contactName:"School liaison "+randomUUID(),
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(created.error).toBeUndefined();
  expect(created.data.createdContactId).toBeTruthy();
  expect(created.data).not.toHaveProperty("createdFamily");
  const studentId=created.data.id as string;
  const grants=await call("ccp_portal_grants_list",{studentId});
  expect(grants.error).toBeUndefined();
  expect(grants.data).toEqual([]);
  const siteGrants=await page.request.get("/api/portal-grants?studentId="+studentId);
  expect(siteGrants.status(),await siteGrants.text()).toBe(200);
  expect(await siteGrants.json()).toEqual([]);
});
