import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";

/**
 * SCH-05/06: every table introduced by the consolidated schema has a
 * database-enforced direct-client boundary, independent of website or MCP
 * route guards. Test both authenticated and anonymous PostgREST roles.
 *
 * These are schema-only source-acceptance checks on disposable CI tenants:
 * no paid checkout, real subscription, or populated production connection.
 */
const protectedTables = [
  {table:"capability_definitions",key:"key",patch:{active:false},authRead:true},
  {table:"plan_versions",key:"id",patch:{priority:1},authRead:true},
  {table:"plan_capabilities",key:"plan_version_id",patch:{unlimited:false},authRead:true},
  {table:"teacher_entitlement_state",key:"teacher_id",patch:{revision:1},authRead:true},
  {table:"teacher_entitlement_grants",key:"id",patch:{reason:"Unauthorized change"},authRead:true},
  {table:"entitlement_audit_events",key:"id",patch:{reason:"Unauthorized change"},authRead:true},
  {table:"account_usage_periods",key:"id",patch:{reserved_count:0},authRead:true},
  {table:"account_usage_events",key:"id",patch:{amount:1},authRead:true},
  {table:"platform_billing_customers",key:"id",patch:{disabled_at:null},authRead:false},
  {table:"platform_subscription_offers",key:"id",patch:{currency:"USD"},authRead:true},
  {table:"platform_subscriptions",key:"id",patch:{state:"active"},authRead:true},
  {table:"platform_billing_events",key:"id",patch:{processing_state:"ignored"},authRead:false},
  {table:"rating_providers",key:"code",patch:{display_name:"Unauthorized"},authRead:true},
  {table:"rating_categories",key:"provider_code",patch:{display_name:"Unauthorized"},authRead:true},
  {table:"slot_occurrence_exceptions",key:"id",patch:{reason:"Unauthorized change"},authRead:true},
  {table:"report_publications",key:"id",patch:{output_locale:"en"},authRead:true},
  {table:"report_publication_audiences",key:"publication_id",patch:{approved_by:randomUUID()},authRead:true},
  {table:"session_amendment_events",key:"id",patch:{source:"service"},authRead:true},
  // Previously existing internal relations are equally sensitive: receipt
  // replay, delivery/audit history and encrypted integration credentials.
  {table:"ccp_delivery_outbox",key:"id",patch:{state:"sent"},authRead:false},
  {table:"ccp_session_note_audit",key:"id",patch:{before_value:{}},authRead:false},
  {table:"teacher_spreadsheet_import_receipts",key:"teacher_id",patch:{receipt:{}},authRead:false},
  {table:"ccp_credit_redemption_return_receipts",key:"teacher_id",patch:{created_at:new Date().toISOString()},authRead:false},
  {table:"skill_assessment_write_receipts",key:"teacher_id",patch:{payload:{}},authRead:false},
  {table:"teacher_lichess_connections",key:"teacher_id",patch:{lichess_username:"NotAuthorized"},authRead:false},
  {table:"teacher_lichess_connection_events",key:"id",patch:{action:"connected"},authRead:false},
] as const;

const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const client=()=>createClient(url,anonKey,{
  auth:{persistSession:false,autoRefreshToken:false},
});
const admin=()=>createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
});

test("all 25 sensitive tables reject unauthorized direct writes and private reads",async()=>{
  const privileged=admin();
  const teacherEmail="schema-permissions-"+randomUUID()+"@example.com";
  const password="SchemaPermissions123!";
  const created=await privileged.auth.admin.createUser({
    email:teacherEmail,password,email_confirm:true,
  });
  expect(created.error).toBeNull();
  const teacherId=created.data.user!.id;
  const provisioned=await privileged.from("teachers").insert({
    id:teacherId,email:teacherEmail,display_name:"Synthetic permissions teacher",
  });
  expect(provisioned.error).toBeNull();
  const signed=client();
  const anonymous=client();
  try{
    expect((await signed.auth.signInWithPassword({
      email:teacherEmail,password,
    })).error).toBeNull();
    for(const {table,key,patch,authRead} of protectedTables){
      const tag=table+" direct-client boundary";
      const insert=await signed.from(table).insert({});
      expect(insert.error?.code,tag+" insert").toBe("42501");
      const update=await signed.from(table).update(patch)
        .eq(key,randomUUID());
      expect(update.error?.code,tag+" update").toBe("42501");
      const remove=await signed.from(table).delete()
        .eq(key,randomUUID());
      expect(remove.error?.code,tag+" delete").toBe("42501");
      const anonymousRead=await anonymous.from(table).select("*").limit(1);
      expect(anonymousRead.error?.code,tag+" anonymous read").toBe("42501");
      const signedRead=await signed.from(table).select("*").limit(1);
      if(authRead)expect(signedRead.error,tag+" authenticated read").toBeNull();
      else expect(signedRead.error?.code,tag+" private read").toBe("42501");
    }
  }finally{
    await signed.auth.signOut();
    expect((await privileged.auth.admin.deleteUser(teacherId)).error).toBeNull();
  }
});

test("commercial authority readback is tenant-isolated even for the same plan",async()=>{
  const privileged=admin();
  const teachers=[] as {id:string;email:string;password:string}[];
  const viewers=[] as ReturnType<typeof client>[];
  try{
    for(let i=0;i<2;i++){
      const email="schema-isolation-"+randomUUID()+"@example.com";
      const password="SchemaIsolation123!";
      const user=await privileged.auth.admin.createUser({
        email,password,email_confirm:true,
      });
      expect(user.error).toBeNull();
      const id=user.data.user!.id;
      teachers.push({id,email,password});
      expect((await privileged.from("teachers").insert({
        id,email,display_name:"Isolated synthetic teacher",
      })).error).toBeNull();
      const viewer=client();
      viewers.push(viewer);
      expect((await viewer.auth.signInWithPassword({email,password})).error).toBeNull();
    }
    const [first,second]=teachers;
    const issued=await privileged.from("teacher_entitlement_grants").insert({
      teacher_id:first.id,kind:"capability_boost",
      capability_key:"students.active",capability_kind:"integer_limit",
      integer_value:1,unlimited:false,issued_by:first.id,
      reason:"Synthetic tenant isolation verification",request_id:randomUUID(),
    }).select("id").single();
    expect(issued.error).toBeNull();
    const own=await viewers[0].from("teacher_entitlement_grants")
      .select("id").eq("teacher_id",first.id);
    expect(own.error).toBeNull();
    expect(own.data?.map(x=>x.id)).toContain(issued.data!.id);
    for(const table of [
      "teacher_entitlement_state","teacher_entitlement_grants",
      "entitlement_audit_events","account_usage_periods",
      "account_usage_events","platform_subscriptions",
      "slot_occurrence_exceptions","report_publications",
      "report_publication_audiences","session_amendment_events",
    ]){
      const result=await viewers[1].from(table)
        .select("*").eq("teacher_id",first.id);
      expect(result.error,table+" cross-tenant read").toBeNull();
      expect(result.data,table+" cross-tenant read").toEqual([]);
    }
    const forbidden=await viewers[1].rpc("ccp_entitlement_summary");
    expect(forbidden.error).toBeNull();
    expect(forbidden.data?.studentCapacity).toBeDefined();
  }finally{
    for(const viewer of viewers)await viewer.auth.signOut();
    for(const user of teachers)
      expect((await privileged.auth.admin.deleteUser(user.id)).error).toBeNull();
  }
});

test("populated P0 records are owner-readable only and scoped scheduling RPCs need the owner role",async()=>{
 const privileged=admin();
 const actors=[] as {id:string;session:ReturnType<typeof client>}[];
 try{
  for(let i=0;i<2;i++){
   const email="schema-populated-role-"+randomUUID()+"@example.invalid";
   const password="SchemaPopulatedRole123!";
   const created=await privileged.auth.admin.createUser({email,password,email_confirm:true});
   expect(created.error).toBeNull();
   const id=created.data.user!.id,session=client();
   actors.push({id,session});
   expect((await privileged.from("teachers").insert({
    id,email,display_name:"Synthetic populated-role teacher",
   })).error).toBeNull();
   expect((await session.auth.signInWithPassword({email,password})).error).toBeNull();
  }
  const [owner,foreigner]=actors;
  const anon=client();
  const teacher_id=owner.id;
  const handle="SyntheticACLRating";
  const learner=await privileged.from("students").insert({
   teacher_id,name:"Synthetic scoped learner",lichess_username:handle,
  }).select("id").single();
  expect(learner.error).toBeNull();
  const student_id=learner.data!.id as string;
  const consent=await privileged.from("student_rating_sync_consents").insert({
   teacher_id,student_id,provider:"lichess",source_username:handle,
   enabled:true,consented_at:new Date().toISOString(),
  }).select("id,handle_revision").single();
  expect(consent.error).toBeNull();
  const job=await privileged.from("student_rating_refresh_jobs").insert({
   teacher_id,student_id,consent_id:consent.data!.id,provider:"lichess",source_username:handle,
   handle_revision:consent.data!.handle_revision,input_digest:"a".repeat(64),idempotency_key:randomUUID(),
   trigger_kind:"manual",status:"failed",finished_at:new Date().toISOString(),attempt_count:1,
  }).select("id").single();
  expect(job.error).toBeNull();
  const receipt=await privileged.from("student_rating_refresh_receipts").insert({
   teacher_id,student_id,job_id:job.data!.id,attempt_number:1,outcome:"failed",
   source_username:handle,input_digest:"a".repeat(64),error_code:"SYNTHETIC_SCOPE",
  }).select("id").single();
  expect(receipt.error).toBeNull();

  const workplace=await privileged.from("workplaces").update({timezone:"UTC"})
   .eq("teacher_id",teacher_id).eq("kind","personal").select("id").single();
  expect(workplace.error).toBeNull();
  const workplace_id=workplace.data!.id as string;
  expect((await privileged.from("workplace_enrollments").insert({
   teacher_id,student_id,workplace_id,source:"manual",
  })).error).toBeNull();
  const utcDay=Date.parse(new Date().toISOString().slice(0,10));
  const date=(n:number)=>new Date(utcDay+n*86400000).toISOString().slice(0,10);
  const slot=await privileged.from("lesson_slots").insert({
   teacher_id,student_id,workplace_id,start_date:date(7),end_date:date(21),
   start_time:"09:00",day_of_week:new Date(date(7)).getUTCDay(),duration_minutes:45,
  }).select("id,updated_at").single();
  expect(slot.error).toBeNull();
  const exception=await privileged.from("slot_occurrence_exceptions").insert({
   teacher_id,slot_id:slot.data!.id,original_occurrence_on:date(21),action:"cancel",
   reason:"Synthetic private occurrence",approved_by:teacher_id,request_id:randomUUID(),
  }).select("id").single();
  expect(exception.error).toBeNull();

  expect((await privileged.from("teacher_entitlement_grants").insert({
   teacher_id,kind:"capability_boost",capability_key:"reports.publish",capability_kind:"boolean",
   boolean_value:true,unlimited:false,issued_by:teacher_id,reason:"Synthetic scoped report access",
   request_id:randomUUID(),
  })).error).toBeNull();
  const contact=await privileged.from("contacts").insert({
   teacher_id,display_name:"Synthetic scoped contact",
  }).select("id").single();
  expect(contact.error).toBeNull();
  const grant=await privileged.from("portal_access_grants").insert({
   teacher_id,student_id,workplace_id,contact_id:contact.data!.id,permissions:["shared_notes"],
   issued_at:new Date().toISOString(),expires_at:date(30)+"T00:00:00Z",token_digest:"a".repeat(64),
  }).select("id").single();
  expect(grant.error).toBeNull();
  const report=await privileged.from("report_publications").insert({
   teacher_id,student_id,workplace_id,snapshot_digest:"b".repeat(64),
   snapshot_storage_ref:"synthetic/"+randomUUID(),output_locale:"en",approved_by:teacher_id,
   approved_at:new Date().toISOString(),request_id:randomUUID(),
  }).select("id").single();
  expect(report.error).toBeNull();
  const audience=await privileged.from("report_publication_audiences").insert({
   teacher_id,publication_id:report.data!.id,portal_grant_id:grant.data!.id,
   approved_by:teacher_id,request_id:randomUUID(),
  }).select("publication_id").single();
  expect(audience.error).toBeNull();

  const rows=[
   ["student_rating_sync_consents","id",consent.data!.id],
   ["student_rating_refresh_jobs","id",job.data!.id],
   ["student_rating_refresh_receipts","id",receipt.data!.id],
   ["slot_occurrence_exceptions","id",exception.data!.id],
   ["report_publications","id",report.data!.id],
   ["report_publication_audiences","publication_id",audience.data!.publication_id],
  ] as const;
  for(const [table,key,value] of rows){
   const own=await owner.session.from(table).select(key).eq(key,value);
   expect(own.error,table+" owner read").toBeNull();
   expect(own.data,table+" actual owner row").toHaveLength(1);
   const outside=await foreigner.session.from(table).select(key).eq(key,value);
   expect(outside.error,table+" foreign read").toBeNull();
   expect(outside.data,table+" known foreign row hidden").toEqual([]);
   const unauthenticated=await anon.from(table).select(key).eq(key,value);
   expect(unauthenticated.error?.code,table+" anonymous read").toBe("42501");
   const ownerMutation=await owner.session.from(table).update({teacher_id}).eq(key,value);
   expect(ownerMutation.error?.code,table+" direct owner mutation").toBe("42501");
  }
  const rawReceiptUpdate=await privileged.from("student_rating_refresh_receipts")
   .update({error_code:"ALTERED"}).eq("id",receipt.data!.id);
  expect(rawReceiptUpdate.error?.code).toBe("42501");
  const rawReceiptDelete=await privileged.from("student_rating_refresh_receipts").delete().eq("id",receipt.data!.id);
  expect(rawReceiptDelete.error?.code).toBe("42501");

  const args={
   p_slot_id:slot.data!.id,p_cutoff:date(14),p_tail_id:randomUUID(),p_changes:{startTime:"10:00"},
   p_to:date(21),p_expected_updated_at:slot.data!.updated_at,p_review_digest:null,
   p_idempotency_key:randomUUID(),p_confirmed:false,
  };
  for(const [name,request] of [
   ["ccp_canonical_terminal_slot_split",args],
   ["ccp_canonical_slot_edit_scoped",{...args,p_scope:"this_and_future"}],
  ] as const){
   const ownerPreview=await owner.session.rpc(name,request);
   expect(ownerPreview.error,name+" own preview").toBeNull();
   expect(ownerPreview.data?.reviewDigest).toMatch(/^[a-f0-9]{64}$/);
   const foreignPreview=await foreigner.session.rpc(name,request);
   expect(foreignPreview.error?.code,name+" foreign owner").toBe("42501");
   expect(foreignPreview.error?.message,name+" foreign slot identity").toMatch(/NOT_FOUND$/);
   for(const blocked of [anon,privileged]){
    const denied=await blocked.rpc(name,request);
    expect(denied.error?.code,name+" execute grant").toBe("42501");
    expect(denied.error?.message,name+" SQL privilege denial").toContain("permission denied for function");
   }
  }
  const stored=await privileged.from("lesson_slots").select("id").eq("teacher_id",teacher_id);
  expect(stored.error).toBeNull();
  expect(stored.data).toEqual([{id:slot.data!.id}]);
 }finally{
  for(const actor of actors)await actor.session.auth.signOut();
  for(const actor of actors)expect((await privileged.auth.admin.deleteUser(actor.id)).error).toBeNull();
 }
});
