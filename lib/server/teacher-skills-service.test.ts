import {describe,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {skillDimensionsCreate,TeacherSkillsError} from "./teacher-skills-service";

const requestId="1aa249c9-765d-4989-8888-1ef6e5a80ff4";
const dbFor=(data:unknown,error:unknown=null)=>{
 const rpc=vi.fn().mockResolvedValue({data,error});
 return {db:{rpc} as unknown as SupabaseClient,rpc};
};
describe("canonical skill dimension creation",()=>{
 it("passes a cross-client receipt through the same tenant-derived SQL transaction",async()=>{
  const record={id:requestId,name:"Tactics",sort_order:1};
  const {db,rpc}=dbFor(record);
  await expect(skillDimensionsCreate(db,"teacher-1"," Tactics ",requestId))
    .resolves.toEqual(record);
  expect(rpc).toHaveBeenCalledWith("ccp_skill_dimension_create",{
   p_name:"Tactics",p_request_id:requestId,
  });
 });
 it("rejects invalid names and request IDs before calling SQL",async()=>{
  const {db,rpc}=dbFor({});
  await expect(skillDimensionsCreate(db,"teacher-1"," ")).rejects.toMatchObject({status:400});
  await expect(skillDimensionsCreate(db,"teacher-1","Valid","not-a-uuid"))
   .rejects.toMatchObject({status:400});
  expect(rpc).not.toHaveBeenCalled();
 });
 it("returns a typed conflict for a changed-payload receipt",async()=>{
  const {db}=dbFor(null,{code:"23505",message:"SKILL_DIMENSION_REQUEST_CONFLICT"});
  await expect(skillDimensionsCreate(db,"teacher-1","Tactics",requestId))
   .rejects.toMatchObject({status:409,code:"CONFLICT"});
 });
 it("does not conceal tenant authentication failure",async()=>{
  const {db}=dbFor(null,{code:"42501",message:"UNAUTHENTICATED"});
  await expect(skillDimensionsCreate(db,"teacher-1","Tactics",requestId))
   .rejects.toMatchObject({status:403,code:"FORBIDDEN"});
 });
});
