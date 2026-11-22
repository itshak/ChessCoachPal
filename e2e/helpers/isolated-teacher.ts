import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";

/** Give a scheduling test its own disposable calendar instead of the shared seed calendar. */
export const isolatedTeacherTest=test.extend<{isolatedTeacher:{email:string;password:string}}>({
  isolatedTeacher:async({},run)=>{
    const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
      auth:{persistSession:false,autoRefreshToken:false},
    });
    const email="isolated-calendar-"+randomUUID()+"@example.invalid";
    const password="SyntheticCalendar-123!";
    const identity=await db.auth.admin.createUser({email,password,email_confirm:true});
    expect(identity.error).toBeNull();
    const id=identity.data.user!.id;
    try{
      const profile=await db.from("teachers").insert({
        id,email,display_name:"Synthetic isolated calendar",
        preferred_locale:"en",onboarding_tour_completed_at:new Date().toISOString(),
      });
      expect(profile.error).toBeNull();
      await run({email,password});
    }finally{
      expect((await db.auth.admin.deleteUser(id)).error).toBeNull();
    }
  },
});
