import {randomUUID} from "node:crypto";
import {expect} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {isolatedTeacherTest as test} from "./helpers/isolated-teacher";

test("PARITY: owned display-name contact search preserves homonyms, redaction and explicit keyboard selection",async({page,request,browser,isolatedTeacher})=>{
 const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
 const suffix=randomUUID().slice(0,8);
 const name="Contact   Ｓchool "+suffix;
 const query="  cOnTaCt school "+suffix+"  ";
 const email="do-not-search-"+suffix+"@example.invalid";
 const create=async(displayName:string,kind:"person"|"organization",privateEmail?:string)=>{
  const made=await call("ccp_contacts_create",{displayName,kind,email:privateEmail,
    idempotencyKey:randomUUID(),confirmed:true});
  expect(made.error).toBeUndefined();
  return made.data.id as string;
 };
 const personId=await create(name,"person",email);
 const homonymId=await create(name,"person");
 const organizationId=await create(name,"organization");
 await create("Unrelated "+suffix,"person");
 const foreignContext=await browser.newContext();
 let foreignId="";
 try{
  const foreignCall=await delegatedTool(await foreignContext.newPage(),request);
  const foreign=await foreignCall("ccp_contacts_create",{displayName:name,kind:"organization",
   idempotencyKey:randomUUID(),confirmed:true});
  expect(foreign.error).toBeUndefined();
  foreignId=foreign.data.id;
 }finally{await foreignContext.close();}
 const website=async(queryValue?:string)=>await page.request.get(
  "/api/contacts"+(queryValue===undefined?"":"?"+new URLSearchParams({query:queryValue})));
 const lookup=async(queryValue:string)=>{
  const [web,model]=await Promise.all([website(queryValue),call("ccp_contacts_list",{query:queryValue})]);
  expect(web.status(),await web.text()).toBe(200);
  expect(model.error).toBeUndefined();
  expect(await web.json()).toEqual(model.data);
  return model.data;
 };
 const [defaultSite,defaultModel]=await Promise.all([website(),call("ccp_contacts_list",{})]);
 expect(defaultSite.status()).toBe(200);
 expect(defaultModel.error).toBeUndefined();
 expect(await defaultSite.json()).toEqual(defaultModel.data);
 expect(await lookup("   ")).toEqual(defaultModel.data);
 const matches=await lookup(query);
 expect(matches.map((row:{id:string})=>row.id).sort()).toEqual([personId,homonymId,organizationId].sort());
 expect(matches.some((row:{id:string})=>row.id===foreignId)).toBe(false);
 for(const row of matches){
  expect(row).not.toHaveProperty("email");
  expect(row).not.toHaveProperty("phone");
  expect(row).not.toHaveProperty("preferredLocale");
 }
 expect(await lookup(email)).toEqual([]);
 expect(await lookup("%_")).toEqual([]);
 expect((await website("a".repeat(161))).status()).toBe(400);
 expect((await call("ccp_contacts_list",{query:"a".repeat(161)})).error?.code).toBe("VALIDATION_ERROR");
 expect((await call("ccp_contacts_detail",{contactId:foreignId})).error?.code).toBe("NOT_FOUND");
 expect((await page.request.get("/api/contacts/"+foreignId)).status()).toBe(404);

 await page.goto("/contacts");
 const box=page.getByRole("searchbox",{name:"Search contacts by display name"});
 await box.fill(query);
 await expect(page.getByText("Matching contacts: 3",{exact:true})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Edit contact"})).toHaveCount(0);
 await expect(page.getByRole("button",{name:new RegExp(personId)})).toBeVisible();
 await expect(page.getByRole("button",{name:new RegExp(homonymId)})).toBeVisible();
 const org=page.getByRole("button",{name:new RegExp(organizationId)});
 await expect(org).toBeVisible();
 const chooser=page.getByRole("button",{name:new RegExp(personId)});
 let release!:()=>void,requested!:()=>void,responseDelivered!:()=>void;
 const held=new Promise<void>(r=>{release=r;});
 const firstRequested=new Promise<void>(r=>{requested=r;});
 const firstDelivered=new Promise<void>(r=>{responseDelivered=r;});
 const form=page.getByRole("heading",{name:"Edit contact"}).locator("..");
 const kind=form.locator("select").filter({has:page.locator('option[value="organization"]')});
 const emailField=form.locator('input[type="email"]');
 const firstPath="/api/contacts/"+personId;
 let wrongWrites=0;
 await page.route("**"+firstPath,async route=>{
  if(route.request().method()!=="GET"){wrongWrites++;await route.abort();return;}
  const response=await route.fetch();requested();
  await held;
  await route.fulfill({response}).finally(responseDelivered);
 });
 try{
  await chooser.focus();await page.keyboard.press("Enter");
  await firstRequested;
  await expect(page.getByRole("button",{name:"Save",exact:true})).toHaveCount(0);
  const selected=page.waitForResponse(r=>r.request().method()==="GET"&&
   new URL(r.url()).pathname==="/api/contacts/"+organizationId);
  await org.focus();await page.keyboard.press("Enter");
  expect((await selected).status()).toBe(200);
  await expect(org).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("heading",{name:"Edit contact"})).toBeVisible();
  await expect(kind).toHaveValue("organization");
  const oldResponse=page.waitForResponse(r=>new URL(r.url()).pathname===firstPath);
  release();await firstDelivered;await (await oldResponse).finished();
  await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));
  await expect(kind).toHaveValue("organization");
  await expect(emailField).toHaveValue("");
  expect(wrongWrites).toBe(0);
 }finally{release();await firstDelivered.catch(()=>{});await page.unroute("**"+firstPath);}
 const locale=await page.request.put("/api/auth/update-profile",{data:{preferredLocale:"he"}});
 expect(locale.status(),await locale.text()).toBe(200);
 await page.goto("/contacts");
 await expect(page.locator("html")).toHaveAttribute("dir","rtl");
 const hebrewSearch=page.getByRole("searchbox",{name:"חיפוש אנשי קשר לפי שם תצוגה"});
 await hebrewSearch.fill(query);
 await expect(page.getByText("אנשי קשר שנמצאו: 3",{exact:true})).toBeVisible();
});
