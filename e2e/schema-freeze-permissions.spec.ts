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
