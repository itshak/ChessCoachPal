import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY:PARITY-daily-rating-review uses recorded outcomes, not missing or old bindings",async({page,request})=>{
  test.setTimeout(120_000);
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
  });
  const identities:string[]=[];
  const password="DailyRatingReviewSynthetic123!";
  async function tenant(){
    const email="daily-rating-"+randomUUID()+"@example.invalid";
    const auth=await admin.auth.admin.createUser({email,password,email_confirm:true});
    expect(auth.error).toBeNull();
    const id=auth.data.user!.id;
    identities.push(id);
    expect((await admin.from("teachers").insert({id,email,display_name:"Daily ratings fixture",preferred_locale:"en",
      onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
    await configureSyntheticStudentCapacity(admin,id,20,2);
    return {id,email};
  }
  async function row(table:string,value:Record<string,unknown>){
    const result=await admin.from(table).insert(value).select("id").single();
    expect(result.error,table).toBeNull();
    return result.data!.id as string;
  }
  async function binding(teacher_id:string,provider:"lichess"|"chesscom",suffix:string){
    const username="synthetic_"+suffix;
    const student_id=await row("students",{teacher_id,name:"Private learner "+suffix,
      [provider==="lichess"?"lichess_username":"chesscom_username"]:username});
    const consent_id=await row("student_rating_sync_consents",{
      teacher_id,student_id,provider,source_username:username,enabled:true,
      consented_at:"2026-07-30T12:00:00Z",
    });
    return {teacher_id,student_id,provider,source_username:username,consent_id};
  }
  type Binding=Awaited<ReturnType<typeof binding>>;
  async function receipt(b:Binding,outcome:"failed"|"retry"|"stale"|"succeeded",code:string|null,
    recorded_at:string,scope:{kind?:string;handleRevision?:number;wrongDigest?:boolean}={}){
    const {teacher_id,student_id,source_username}=b;
    const input_digest=randomUUID().replaceAll("-","").repeat(2);
    const job_id=await row("student_rating_refresh_jobs",{
      ...b,handle_revision:scope.handleRevision??1,input_digest,idempotency_key:randomUUID(),
      trigger_kind:scope.kind??"scheduled",status:outcome,attempt_count:1,last_error_code:code,
      finished_at:outcome==="retry"?null:recorded_at,created_at:"2026-07-31T20:00:00Z",
    });
    await row("student_rating_refresh_receipts",{
      teacher_id,student_id,job_id,attempt_number:1,source_username,
      input_digest:scope.wrongDigest?"e".repeat(64):input_digest,recorded_at,outcome,error_code:code,
      ...(outcome==="succeeded"?{fetched_at:recorded_at,evidence_digest:"a".repeat(64)}:{}),
    });
  }
  try{
    const owner=await tenant(), foreign=await tenant();
    const teacher_id=owner.id;
    expect((await admin.from("teacher_settings").upsert({teacher_id,timezone:"America/New_York"})).error).toBeNull();
    const venue=await row("workplaces",{teacher_id,name:"School for rating review",timezone:"UTC",locale:"en",
      currency:"USD",kind:"professional",policy:{}});
    const failed=await binding(teacher_id,"lichess","real_failure");
    const resolved=await binding(teacher_id,"lichess","resolved");
    const retry=await binding(teacher_id,"chesscom","retry");
    const discarded=await binding(teacher_id,"chesscom","discarded");
    const outside=await binding(teacher_id,"chesscom","outside_day");
    const replaced=await binding(teacher_id,"lichess","stale_binding");
    const archived=await binding(teacher_id,"lichess","archived");
    const lease=await binding(teacher_id,"lichess","lease_expired");
    const never=await binding(teacher_id,"chesscom","never_run");
    const ignored=await binding(teacher_id,"lichess","backfill");
    const mismatched=await binding(teacher_id,"lichess","mismatched");
    const foreignBinding=await binding(foreign.id,"lichess","foreign");
    const begin="2026-08-01T04:00:00Z",early="2026-08-01T15:00:00Z",late="2026-08-02T03:59:59Z";
    await receipt(failed,"retry","RATE_LIMITED",begin);
    await receipt(failed,"failed","PROVIDER_DENIED",late);
    await receipt(resolved,"failed","PROVIDER_RESPONSE",begin);
    await receipt(resolved,"succeeded",null,late);
    await receipt(retry,"retry","RATE_LIMITED",early);
    await receipt(discarded,"stale","RATING_PROVIDER_UNAVAILABLE",early);
    await receipt(outside,"failed","PROVIDER_DENIED","2026-08-02T04:00:00Z");
    await receipt(outside,"failed","PROVIDER_DENIED","2026-08-01T03:59:59Z");
    await receipt(replaced,"failed","PROVIDER_DENIED",early,{handleRevision:2});
    await receipt(archived,"failed","PROVIDER_DENIED",early);

    await receipt(lease,"failed","RATING_LEASE_EXPIRED",early);
    await receipt(ignored,"failed","PROVIDER_DENIED",early,{kind:"history_backfill"});
    await receipt(mismatched,"failed","PROVIDER_DENIED",early,{wrongDigest:true});
    await receipt(foreignBinding,"failed","PROVIDER_DENIED",early);
    const snapshot=async()=>{
      const collected=await Promise.all([
        admin.from("student_rating_refresh_jobs").select("id,status,attempt_count").eq("teacher_id",teacher_id).order("id"),
        admin.from("student_rating_refresh_receipts").select("id,outcome,recorded_at").eq("teacher_id",teacher_id).order("id"),
        admin.from("student_rating_snapshots").select("id,rating").eq("teacher_id",teacher_id).order("id"),
      ]);
      expect(collected.map(x=>x.error)).toEqual([null,null,null]);
      return collected.map(x=>x.data);
    };
    const tool=await delegatedTool(page,request,"coach:read coach:write",{email:owner.email,password});
    const reviewArchive=await tool("ccp_students_lifecycle_preview",{studentId:archived.student_id});
    expect(reviewArchive.error).toBeUndefined();
    expect((await tool("ccp_students_lifecycle_commit",{
      studentId:archived.student_id,mode:"archive",expectedUpdatedAt:reviewArchive.data.expectedUpdatedAt,
      selectedWorkplaceIds:[],requestId:randomUUID(),reason:"Synthetic archived rating evidence remains historical",confirmed:true,
    })).error).toBeUndefined();
    const before=await snapshot();
    const read=async(date:string)=>{
      const http=await page.request.get("/api/dashboard/summary?date="+date);
      expect(http.status(),await http.text()).toBe(200);
      const web=await http.json();
      const mcp=await tool("ccp_dashboard_summary",{date});
      expect(mcp.error).toBeUndefined();
      expect(mcp.data).toEqual(web);
      return web.daily.ratingReview;
    };
    const date="2026-08-01";
    const review=await read(date);
    expect(review).toEqual({status:"ready",truncated:false,issues:[
      {provider:"chesscom",reason:"LOOKUP_DISCARDED",count:1},
      {provider:"chesscom",reason:"PROVIDER_RETRY_RECORDED",count:1},
      {provider:"lichess",reason:"PROVIDER_FAILURE",count:1},
    ]});
    for(const token of [failed.student_id,never.consent_id,"synthetic_","Private learner","RATE_LIMITED","PROVIDER_DENIED"])
      expect(JSON.stringify(review)).not.toContain(token);
    expect(await read("2026-07-29")).toEqual({status:"ready",truncated:false,issues:[]});
    expect(await read("2099-01-01")).toEqual({status:"ready",truncated:false,issues:[]});
    await page.goto("/dashboard?date="+date);
    const region=page.getByRole("region",{name:"Recorded online rating issues"});
    await expect(region.getByRole("listitem")).toHaveCount(3);
    await expect(region.getByText("Recorded failures: 1",{exact:true})).toBeVisible();
    await expect(region.getByText("not a live check",{exact:false})).toBeVisible();
    expect(await tool("ccp_workplace_context_set",{
      selectedWorkplaceId:venue,expectedSelectedWorkplaceId:null,confirmed:true,
    })).toMatchObject({data:{selectedWorkplaceId:venue}});
    expect(await read(date)).toEqual({status:"workplace_scope_unavailable"});
    await page.reload();
    await expect(region.getByText("Select All workplaces",{exact:false})).toBeVisible();
    expect(await snapshot()).toEqual(before);
  }finally{
    for(const id of identities)expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
