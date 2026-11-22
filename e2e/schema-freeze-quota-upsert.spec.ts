import {createHash,randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("at quota, backup and direct upserts count only new active students and professional workplaces",async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options);
 const owner=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
 const email=`quota-upsert-${randomUUID()}@example.com`,password="SyntheticUpsert-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const id=identity.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({id,email,display_name:"Quota proof"})).error).toBeNull();
  await configureSyntheticStudentCapacity(admin,id,1,1);
  expect((await owner.auth.signInWithPassword({email,password})).error).toBeNull();
  const student={id:randomUUID(),teacher_id:id,name:"Existing learner",archived_at:null};
  const workplace={id:randomUUID(),teacher_id:id,name:"Existing workplace",kind:"professional",
   currency:"USD",locale:"en",timezone:"UTC",policy:{},archived_at:null};
  expect((await owner.from("students").insert(student)).error).toBeNull();
  expect((await owner.from("workplaces").insert(workplace)).error).toBeNull();

  async function counts(students:number,workplaces:number){
   const [state,studentRows,workplaceRows]=await Promise.all([
    admin.from("teacher_entitlement_state").select("active_student_count,active_professional_workplace_count")
     .eq("teacher_id",id).single(),
    admin.from("students").select("id",{count:"exact",head:true}).eq("teacher_id",id).is("archived_at",null),
    admin.from("workplaces").select("id",{count:"exact",head:true})
     .eq("teacher_id",id).eq("kind","professional").is("archived_at",null),
   ]);
   for(const result of [state,studentRows,workplaceRows]) expect(result.error).toBeNull();
   expect(state.data).toEqual({active_student_count:students,active_professional_workplace_count:workplaces});
   expect([studentRows.count,workplaceRows.count]).toEqual([students,workplaces]);
  }
  await counts(1,1);

  const p_tables={students:[{...student,name:"Updated from backup"}],
   workplaces:[{...workplace,name:"Renamed from backup"}]};
  const p_digest=createHash("sha256").update(JSON.stringify(p_tables)).digest("hex");
  const restore=()=>owner.rpc("ccp_teacher_backup_restore",{p_tables,p_digest,p_display_name:null});
  const first=await restore();
  expect(first.error).toBeNull();
  expect(first.data).toMatchObject({counts:{students:1,workplaces:1}});
  await counts(1,1);
  const replay=await restore();
  expect(replay.error).toBeNull();
  expect(replay.data).toEqual(first.data);
  await counts(1,1);
  expect((await admin.from("students").select("name").eq("id",student.id).single()).data)
   .toEqual({name:"Updated from backup"});
  expect((await admin.from("workplaces").select("name").eq("id",workplace.id).single()).data)
   .toEqual({name:"Renamed from backup"});

  const upsertStudent={...student,name:"Updated with upsert"};
  const upsertWorkplace={...workplace,name:"Renamed with upsert"};
  expect((await owner.from("students").upsert(upsertStudent).select("name").single()).data)
   .toEqual({name:upsertStudent.name});
  expect((await owner.from("workplaces").upsert(upsertWorkplace).select("name").single()).data)
   .toEqual({name:upsertWorkplace.name});
  expect((await owner.from("students").upsert(student,{ignoreDuplicates:true})).error).toBeNull();
  expect((await owner.from("workplaces").upsert(workplace,{ignoreDuplicates:true})).error).toBeNull();
  await counts(1,1);

  const capacityError={code:"23514",message:"CAPACITY_EXCEEDED"};
  expect((await owner.from("students").insert({...student,id:randomUUID()})).error).toMatchObject(capacityError);
  expect((await owner.from("workplaces").insert({...workplace,id:randomUUID()})).error).toMatchObject(capacityError);
  await counts(1,1);

 }finally{
  expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
 }
});
