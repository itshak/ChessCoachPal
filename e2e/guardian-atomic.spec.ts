import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";

test("authenticated guardian SQL transaction rolls back when a later student fails",async()=>{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
  });
  const email="atomic-family-"+randomUUID()+"@example.com";
  const password="SyntheticFamilyRollback-123!";
  const {data:identity,error:userError}=await admin.auth.admin.createUser({
    email,password,email_confirm:true,
  });
  expect(userError).toBeNull();
  const teacherId=identity.user!.id;
  try{
    expect((await admin.from("teachers").insert({
      id:teacherId,email,display_name:"Atomic Family Test",
      hosted_enforced:false,
    })).error).toBeNull();
    const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
    expect((await auth.auth.signInWithPassword({email,password})).error).toBeNull();
    const label="Rollback "+randomUUID();
    const student="This student must roll back "+randomUUID();
    // The invalid date fails AFTER the otherwise valid family and first
    // student inserts, proving one SQL transaction rather than preflight.
    const failed=await auth.rpc("ccp_guardian_save",{
      p_guardian_id:null,p_fields:{name:label},p_student_ids:[],
      p_replace_members:false,p_new_students:[
        {name:student},{name:"Invalid date",birthdate:"not-a-date"},
      ],
    });
    expect(failed.error).not.toBeNull();
    const families=await auth.from("guardians").select("id").eq("name",label);
    expect(families.error).toBeNull();
    expect(families.data).toEqual([]);
    const students=await auth.from("students").select("id").eq("name",student);
    expect(students.error).toBeNull();
    expect(students.data).toEqual([]);
  }finally{
    await admin.auth.admin.deleteUser(teacherId);
  }
});

test("PARITY:PARITY-guardians-atomic-mutation preserves website/MCP member equality",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const student=(await call("ccp_v1_students_create",{
    name:"Guardian atomic learner "+randomUUID(),idempotencyKey:randomUUID(),
  }));
  expect(student.error).toBeUndefined();
  const id=student.data.entityId as string;
  const guardian=await call("ccp_v1_guardians_create",{
    name:"Atomic guardian "+randomUUID(),studentIds:[id],
    newStudents:[{name:"Additional guardian student "+randomUUID()}],
    confirmed:true,
  });
  expect(guardian.error).toBeUndefined();
  const guardianId=guardian.data.id as string;
  const website=await page.request.get("/api/guardians/"+guardianId);
  expect(website.status(),await website.text()).toBe(200);
  const row=await website.json();
  expect(row.students).toHaveLength(2);
  const rosterIds=row.students.map((x:{id:string})=>x.id);
  expect(rosterIds).toContain(id);
  const revised=await page.request.put("/api/guardians/"+guardianId,{
    data:{studentIds:[id],familyName:"Reviewed roster"},
  });
  expect(revised.status(),await revised.text()).toBe(200);
  const model=await call("ccp_v1_guardians_detail",{guardianId});
  expect(model.error).toBeUndefined();
  expect(model.data.family_name).toBe("Reviewed roster");
  const read=await page.request.get("/api/guardians/"+guardianId);
  expect((await read.json()).students.map((x:{id:string})=>x.id)).toEqual([id]);
});


test("PARITY:PARITY-family-cross-client-idempotency creates one child and rejects altered replays",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const key=randomUUID();
  const name="One family "+randomUUID();
  const childName="One child "+randomUUID();
  const payload={
    name,newStudents:[{name:childName}],idempotencyKey:key,
  };
  const created=await call("ccp_v1_guardians_create",{
    ...payload,confirmed:true,
  });
  expect(created.error).toBeUndefined();
  const guardianId=created.data.id as string;

  const retry=await page.request.post("/api/guardians",{data:payload});
  expect(retry.status(),await retry.text()).toBe(200);
  expect((await retry.json()).id).toBe(guardianId);
  const detail=await page.request.get("/api/guardians/"+guardianId);
  expect(detail.status(),await detail.text()).toBe(200);
  const family=await detail.json();
  expect(family.students.filter((s:{name:string})=>s.name===childName)).toHaveLength(1);
  const conflict=await page.request.post("/api/guardians",{data:{
    name:name+" conflicted",newStudents:[{name:childName}],idempotencyKey:key,
  }});
  expect(conflict.status(),await conflict.text()).toBe(409);

  const updateKey=randomUUID();
  const newFamilyName="Changed family "+randomUUID();
  const edited=await page.request.put("/api/guardians/"+guardianId,{data:{
    familyName:newFamilyName,idempotencyKey:updateKey,
  }});
  expect(edited.status(),await edited.text()).toBe(200);
  const modelRetry=await call("ccp_v1_guardians_update",{
    guardianId,familyName:newFamilyName,idempotencyKey:updateKey,confirmed:true,
  });
  expect(modelRetry.error).toBeUndefined();
  const familyAfter=await call("ccp_v1_guardians_detail",{guardianId});
  expect(familyAfter.error).toBeUndefined();
  expect(familyAfter.data.family_name).toBe(newFamilyName);
  const reject=await call("ccp_v1_guardians_update",{
    guardianId,familyName:"Different reuse",idempotencyKey:updateKey,
    confirmed:true,
  });
  expect(reject.error?.code).toBe("IDEMPOTENCY_CONFLICT");
  const final=await page.request.get("/api/guardians/"+guardianId);
  expect((await final.json()).family_name).toBe(newFamilyName);
});
