import {createHash,randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";

test("EN/HE/RU: OAuth consent is localized but retains exact client, scopes and redirect safety",async({browser})=>{
 const context=await browser.newContext({baseURL:"http://localhost:3000"});
 try{
  const origin="http://localhost:3000",redirect=origin+"/oauth/synthetic-callback";
  const register=await context.request.post("/oauth/register",{data:{
    client_name:"Coach connector locale test",redirect_uris:[redirect],
    token_endpoint_auth_method:"none",
  }});
  expect(register.status(),await register.text()).toBe(201);
  const clientId=(await register.json()).client_id as string;
  const challenge=createHash("sha256").update("v".repeat(64)).digest("base64url");
  const valid=new URLSearchParams({client_id:clientId,redirect_uri:redirect,
    response_type:"code",resource:origin+"/mcp",code_challenge_method:"S256",
    code_challenge:challenge,state:"multilingual-"+randomUUID(),scope:"coach:read coach:write"});
  for(const [locale,dir,title,approve,deny] of [
    ["en","ltr","Authorize AI connector","Authorize","Deny"],
    ["he","rtl","אישור חיבור עוזר AI","אישור גישה","דחייה"],
    ["ru","ltr","Разрешить подключение ИИ-помощника","Разрешить","Отклонить"],
  ] as const){
    const chosen=await context.request.post("/api/preferences/locale",{data:{locale}});
    expect(chosen.status(),await chosen.text()).toBe(200);
    const res=await context.request.get("/oauth/authorize?"+valid);
    expect(res.status(),await res.text()).toBe(200);
    const content=await res.text();
    expect(res.headers()["content-language"]).toBe(locale);
    expect(content).toContain(`<html lang="${locale}" dir="${dir}">`);
    expect(content).toContain(`<h1>${title}</h1>`);
    expect(content).toContain(`>${approve}</button>`);
    expect(content).toContain(`>${deny}</button>`);
    expect(content).toContain('name="decision" value="approve" disabled');
    expect(content).toContain('name="scope" value="coach:read coach:write"');
    expect(content).toContain('name="redirect_uri" value="'+redirect+'"');
    expect(content).not.toContain('name="decision" value="approve" checked');
    const readParams=new URLSearchParams(valid);
    readParams.set("scope","coach:read");
    const readOnly=await context.request.get("/oauth/authorize?"+readParams);
    expect(readOnly.status(),await readOnly.text()).toBe(200);
    const readHtml=await readOnly.text();
    expect(readHtml).toContain('name="scope" value="coach:read"');
    expect(readHtml).toContain({
      en:"This client has not requested write access",
      he:"היישום לא ביקש הרשאת כתיבה",
      ru:"Приложение не запрашивало разрешение на запись",
    }[locale]);
    const invalid=await context.request.get("/oauth/authorize?"+new URLSearchParams({
      ...Object.fromEntries(valid),redirect_uri:"https://attacker.invalid/steal",
    }));
    expect(invalid.status(),await invalid.text()).toBe(400);
    expect(await invalid.text()).toContain(`<html lang="${locale}" dir="${dir}">`);
    expect(invalid.headers()["cache-control"]).toBe("no-store");
  }
 }finally{await context.close();}
});
