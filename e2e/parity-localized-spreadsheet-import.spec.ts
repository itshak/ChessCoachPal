import {randomUUID} from "node:crypto";
import {expect} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";
import {isolatedTeacherTest as test} from "./helpers/isolated-teacher";

const sheets=[
 {locale:"he",name:"שם התלמיד",alternate:"שם תלמיד",status:"בארכיון",
  archived:"כן",active:"לא",unknown:"אולי",sample:"תלמיד בדיקה"},
 {locale:"ru",name:"Имя ученика",alternate:"Ученик",status:"В архиве",
  archived:"в архиве",active:"нет",unknown:"может быть",sample:"Ученик проверки"},
] as const;

test("PARITY: Hebrew and Russian spreadsheet import preserves exact learner names and requires unambiguous reviewed rows",async({
 page,request,isolatedTeacher,
})=>{
 test.setTimeout(65_000);
 const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const teacher=await db.from("teachers").select("id").eq("email",isolatedTeacher.email).single();
 expect(teacher.error).toBeNull();
 const teacherId=teacher.data!.id as string;
 const workplaces=await db.from("workplaces").insert([
  {teacher_id:teacherId,name:"Selected synthetic workplace"},
  {teacher_id:teacherId,name:"Unselected synthetic workplace"},
 ]).select("id,name");
 expect(workplaces.error).toBeNull();
 const workplaceId=workplaces.data!.find(row=>row.name==="Selected synthetic workplace")!.id;
 const prefix="/api/import/spreadsheet";
 const parse=async(filename:string,lines:string[][])=>{
  const bytes=Buffer.from("\uFEFF"+lines.map(row=>row.join(",")).join("\r\n")+"\r\n","utf8");
  const [web,mcp]=await Promise.all([page.request.post(prefix+"/parse",{
   multipart:{file:{name:filename,mimeType:"text/csv",buffer:bytes}},
  }),call("ccp_import_spreadsheet_parse",{filename,base64:bytes.toString("base64")})]);
  expect(web.status()).toBe(200);
  expect(mcp.error).toBeUndefined();
  const parsed=await web.json();
  expect(mcp.data).toEqual(parsed);
  expect(parsed.headers).toEqual(lines[0]);
  const input={headers:parsed.headers};
  const local=await page.request.post(prefix+"/suggest",{data:input});
  expect(local.status()).toBe(200);
  expect(await local.json()).toEqual({mapping:parsed.mapping,warning:null});
  const model=await call("ccp_import_spreadsheet_suggest",input);
  expect(model.error).toBeUndefined();
  expect(model.data).toEqual({mapping:parsed.mapping,warning:null});
  return parsed;
 };
 const review=async(parsed:{rows:Record<string,string>[];mapping:Record<string,string|null>})=>{
  const input={rows:parsed.rows,mapping:parsed.mapping,workplaceId};
  const web=await page.request.put(prefix+"/parse",{data:input});
  expect(web.status()).toBe(200);
  const mcp=await call("ccp_import_spreadsheet_preview",input);
  expect(mcp.error).toBeUndefined();
  expect(mcp.data).toEqual(await web.json());
  expect(mcp.data.writesPerformed).toBe(false);
  return {input,review:mcp.data};
 };
 const snapshot=async()=>{
  const [students,enrollments,receipts]=await Promise.all([
   db.from("students").select("id,name,archived_at").eq("teacher_id",teacherId).order("id"),
   db.from("workplace_enrollments").select("student_id,workplace_id").eq("teacher_id",teacherId).order("student_id"),
   db.from("teacher_spreadsheet_import_receipts").select("*",{head:true,count:"exact"}).eq("teacher_id",teacherId),
  ]);
  for(const query of [students,enrollments,receipts])expect(query.error).toBeNull();
  return {students:students.data!,enrollments:enrollments.data!,receipts:receipts.count};
 };
 try{
  expect(await snapshot()).toEqual({students:[],enrollments:[],receipts:0});
  const names:string[]=[];
  for(const sheet of sheets){
   const name=(state:string)=>sheet.sample+" "+state+" q7-"+randomUUID().slice(0,10);
   const activeName=name("Active"),archivedName=name("Archived"),invalid=name("Invalid");
   const before=await snapshot();
   const conflict=await parse(sheet.locale+"-ambiguous.csv",[
    [sheet.name,sheet.alternate,sheet.status],[invalid,name("Alternate"),sheet.active],
   ]);
   expect(conflict.mapping).toEqual({archived:sheet.status});
   expect(conflict.previewTotal).toBe(0);
   const unapproved=await review(conflict);
   expect(unapproved.review).toMatchObject({reviewDigest:null,reviewedEnvelope:null,issues:[{row:2,message:expect.any(String)}]});
   const unknown=await parse(sheet.locale+"-unknown.csv",[
    [sheet.name,sheet.status],[activeName,sheet.active],[invalid,sheet.unknown],
   ]);
   const incomplete=await review(unknown);
   expect(incomplete.review).toMatchObject({reviewDigest:null,reviewedEnvelope:null,issues:[{row:3,message:expect.any(String)}]});
   for(const rejected of [unapproved,incomplete]){
    const payload={...rejected.input,confirmed:true,idempotencyKey:randomUUID()};
    const web=await page.request.post(prefix+"/commit",{data:payload});
    expect(web.status()).toBe(422);
    expect((await web.json()).code).toBe("IMPORT_REVIEW_REQUIRED");
    expect((await call("ccp_import_spreadsheet_commit",payload)).error?.code).toBe("IMPORT_REVIEW_REQUIRED");
   }
   expect(await snapshot()).toEqual(before);
   const accepted=await parse(sheet.locale+"-roster.csv",[
    [sheet.name,sheet.status],[activeName,sheet.active],[archivedName,sheet.archived],
   ]);
   expect(accepted.mapping).toEqual({student_name:sheet.name,archived:sheet.status});
   expect(accepted.previewRows).toEqual([
    expect.objectContaining({studentName:activeName,archived:false}),
    expect.objectContaining({studentName:archivedName,archived:true}),
   ]);
   const approved=await review(accepted);
   expect(approved.review).toMatchObject({issues:[],selectedWorkplaceId:workplaceId,
    identities:[expect.objectContaining({mode:"create",enrollmentRequested:true}),
     expect.objectContaining({mode:"createArchived",enrollmentRequested:false})],
    reviewedEnvelope:expect.any(Object),reviewDigest:expect.stringMatching(/^[0-9a-f]{64}$/),
   });
   expect(await snapshot()).toEqual(before);
   const payload={...approved.input,confirmed:true,idempotencyKey:randomUUID(),
    reviewDigest:approved.review.reviewDigest,reviewedEnvelope:approved.review.reviewedEnvelope};
   const browser=await page.request.post(prefix+"/commit",{data:payload});
   expect(browser.status()).toBe(200);
   const receipt=await browser.json();
   expect(receipt).toMatchObject({studentsCreated:2,enrollmentsCreated:1,receiptId:payload.idempotencyKey});
   const applied=await snapshot();
   const active=applied.students.find(s=>s.name===activeName);
   expect(active).toEqual(expect.objectContaining({name:activeName,archived_at:null}));
   expect(applied.students.find(s=>s.name===archivedName)).toEqual(
    expect.objectContaining({name:archivedName,archived_at:expect.any(String)}));
   expect(applied.enrollments).toContainEqual({student_id:active!.id,workplace_id:workplaceId});
   expect(applied.enrollments).toHaveLength(before.enrollments.length+1);
   expect(applied.receipts).toBe((before.receipts??0)+1);
   const replay=await call("ccp_import_spreadsheet_commit",payload);
   expect(replay.error).toBeUndefined();
   expect(replay.data).toEqual(receipt);
   expect(await snapshot()).toEqual(applied);
   names.push(activeName,archivedName);
  }
  expect((await snapshot()).students.map(s=>s.name).sort()).toEqual(names.sort());
 }finally{
  // Dispose only the test's receipt evidence before the isolated test teacher.
  expect((await db.from("teacher_spreadsheet_import_receipts").delete().eq("teacher_id",teacherId)).error).toBeNull();
 }
});
