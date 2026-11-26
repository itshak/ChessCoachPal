import {beforeEach,describe,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";

const mocks=vi.hoisted(()=>({
 profile:vi.fn(),createService:vi.fn(),rpc:vi.fn(),table:vi.fn(),select:vi.fn(),match:vi.fn(),single:vi.fn(),
}));
vi.mock("./student-profile-service",()=>({teacherStudentProfile:mocks.profile}));
vi.mock("@/lib/supabase/server",()=>({createServiceClient:mocks.createService}));
import {teacherOnlineRatingConsentRead,teacherOnlineRatingConsentApply} from "./online-rating-consent";

const studentId="00000000-0000-4000-8000-000000000001",teacherId="00000000-0000-4000-8000-000000000002";
const requestId="00000000-0000-4000-8000-000000000003",jobId="00000000-0000-4000-8000-000000000004";
const db={} as SupabaseClient;
const minimal={studentId,provider:"lichess"} as const;
const apply={...minimal,username:"ConfirmedUsername",studentEpoch:"8000",expectedRevision:1,enable:true,requestId,confirmed:true} as const;

beforeEach(()=>{
 vi.resetAllMocks();
 mocks.profile.mockResolvedValue({id:studentId});
 mocks.createService.mockReturnValue({rpc:mocks.rpc,from:mocks.table});
 mocks.table.mockReturnValue({select:mocks.select});
 mocks.select.mockReturnValue({eq:mocks.match});
 mocks.match.mockReturnValue({eq:mocks.match,maybeSingle:mocks.single});
});

describe("automatic rating consent owner service",()=>{
 it("does not consult the service role for a foreign learner or unconfirmed mutation",async()=>{
  const denial=new Error("Owner scope denies lookup");
  mocks.profile.mockRejectedValue(denial);
  await expect(teacherOnlineRatingConsentRead(db,teacherId,minimal)).rejects.toBe(denial);
  await expect(teacherOnlineRatingConsentApply(db,teacherId,apply)).rejects.toBe(denial);
  expect(mocks.createService).not.toHaveBeenCalled();
  mocks.profile.mockClear();
  // True confirmation is required even if the supplied current revision is valid.
  await expect(teacherOnlineRatingConsentApply(db,teacherId,{...apply,confirmed:false} as unknown as typeof apply)).rejects.toThrow();
  expect(mocks.profile).not.toHaveBeenCalled();
 });
 it("reads scoped saved account state without creating permission",async()=>{
  mocks.rpc.mockResolvedValue({data:{epoch:"8000",archived:false,handle:"ConfirmedUsername"},error:null});
  mocks.single.mockResolvedValue({data:null,error:null});
  await expect(teacherOnlineRatingConsentRead(db,teacherId,minimal)).resolves.toEqual({
   ...minimal,username:"ConfirmedUsername",studentEpoch:"8000",expectedRevision:0,
   enabled:false,canChange:true,accountOwnershipVerified:false,
  });
  expect(mocks.profile).toHaveBeenCalledWith(db,teacherId,studentId);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("ccp_manual_online_rating_binding",{
   p_teacher_id:teacherId,p_student_id:studentId,p_provider:"lichess",
  });
  expect(mocks.table).toHaveBeenCalledExactlyOnceWith("student_rating_sync_consents");
  expect(mocks.match.mock.calls).toEqual([["teacher_id",teacherId],["student_id",studentId],["provider","lichess"]]);
 });
 it("returns historic receipt without representing it as current permission",async()=>{
  mocks.rpc.mockResolvedValue({data:{status:"accepted",jobId,replayed:true},error:null});
  await expect(teacherOnlineRatingConsentApply(db,teacherId,apply)).resolves.toEqual({
   ...minimal,status:"accepted",jobId,replayed:true,
  });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("ccp_online_rating_consent_apply",{
   p_teacher_id:teacherId,p_student_id:studentId,p_provider:"lichess",p_username:"ConfirmedUsername",
   p_student_epoch:"8000",p_expected_revision:1,p_enable:true,p_request_id:requestId,
  });
  expect(mocks.table).not.toHaveBeenCalled();
 });
 it.each([
  {error:{code:"55P03",message:"private"},data:null,code:"RATING_CONSENT_CONTEXT_BUSY",status:409},
  {error:{code:"23505",message:"private"},data:null,code:"IDEMPOTENCY_CONFLICT",status:409},
  {error:null,data:{status:"stale"},code:"RATING_CONSENT_STALE",status:409},
  {error:null,data:{status:"provider_unavailable"},code:"RATING_PROVIDER_UNAVAILABLE",status:409},
  {error:null,data:{status:"revoked",replayed:false},code:"RATING_CONSENT_UNAVAILABLE",status:503},
 ])("maps $code without leaking internal details",async({error,data,code,status})=>{
  mocks.rpc.mockResolvedValue({error,data});
  await expect(teacherOnlineRatingConsentApply(db,teacherId,apply)).rejects.toMatchObject({code,status});
 });
});
