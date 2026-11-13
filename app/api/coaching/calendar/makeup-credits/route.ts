import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {canonicalMakeupCreditsList}
 from "@/lib/server/canonical-makeup-service";

export async function GET(){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{
  return NextResponse.json({credits:await canonicalMakeupCreditsList(db,user.id)},{
   headers:{"Cache-Control":"no-store"},
  });
 }catch{
  return NextResponse.json({error:"Unable to list make-up credits"},{status:503,
   headers:{"Cache-Control":"no-store"}});
 }
}
