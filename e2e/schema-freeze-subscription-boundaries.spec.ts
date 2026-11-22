import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";

/**
 * PAY-05: the normalized subscription state is evaluated from durable SQL
 * at exact effective timestamps, not from a checkout redirect or UI cache.
 * No external payment is attempted; all records are synthetic.
 */
test("paid, trial, cancel-at-end and grace windows expire exactly; failed and disputed states do not grant Pro",async()=>{
  const admin=createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {auth:{persistSession:false,autoRefreshToken:false}},
  );
  const email="subscription-boundary-"+randomUUID()+"@example.com";
  const identity=await admin.auth.admin.createUser({
    email,password:"SubscriptionBoundary123!",email_confirm:true,
  });
  expect(identity.error).toBeNull();
  const teacherId=identity.data.user!.id;
  try{
    expect((await admin.from("teachers").insert({
      id:teacherId,email,display_name:"Synthetic subscription boundaries",
    })).error).toBeNull();
    const pro=await admin.from("plan_versions")
      .select("id").eq("code","pro").eq("version",1).single();
    expect(pro.error).toBeNull();
    const provider="synthetic";
    const merchantScope="acceptance_"+randomUUID();
    const customer=await admin.from("platform_billing_customers").insert({
      teacher_id:teacherId,provider,merchant_scope:merchantScope,
      external_customer_id:"customer_"+randomUUID(),
    }).select("id").single();
    expect(customer.error).toBeNull();
    const offer=await admin.from("platform_subscription_offers").insert({
      plan_version_id:pro.data!.id,provider,merchant_scope:merchantScope,
      external_price_id:"price_"+randomUUID(),currency:"USD",
      billing_interval:"month",effective_from:"2029-01-01T00:00:00Z",
    }).select("id").single();
    expect(offer.error).toBeNull();
    const subscription=await admin.from("platform_subscriptions").insert({
      teacher_id:teacherId,customer_id:customer.data!.id,offer_id:offer.data!.id,
      provider,merchant_scope:merchantScope,
      external_subscription_id:"subscription_"+randomUUID(),
      state:"trialing",current_period_end:"2030-06-10T00:00:00Z",
      latest_event_time:"2029-01-01T00:00:00Z",
    }).select("id").single();
    expect(subscription.error).toBeNull();

    const hasPro=async(at:string)=>{
      const result=await admin.rpc("ccp_effective_capability",{
        p_teacher:teacherId,p_capability_key:"reports.publish",p_at:at,
      });
      expect(result.error).toBeNull();
      return result.data?.planCode==="pro" && result.data?.enabled===true;
    };
    const early="2030-06-09T23:59:59Z";
    const exact="2030-06-10T00:00:00Z";
    expect(await hasPro(early),"trial before expiration").toBe(true);
    expect(await hasPro(exact),"trial on expiration").toBe(false);

    let eventOrder=1;
    const transition=async(state:string,other:Record<string,unknown>={})=>{
      eventOrder++;
      const changed=await admin.from("platform_subscriptions").update({
        state,latest_event_time:`2029-01-${String(eventOrder).padStart(2,"0")}T00:00:00Z`,
        ...other,
      }).eq("id",subscription.data!.id);
      expect(changed.error,state).toBeNull();
    };
    await transition("active",{paid_through:exact});
    expect(await hasPro(early),"verified active until paid-through").toBe(true);
    expect(await hasPro(exact),"active does not overrun paid-through").toBe(false);

    await transition("cancel_at_period_end",{cancel_at:"2030-06-01T00:00:00Z"});
    expect(await hasPro(early),"cancel-at-end preserves paid service").toBe(true);
    expect(await hasPro(exact),"cancel-at-end has strict expiry").toBe(false);

    await transition("grace",{grace_until:"2030-06-07T00:00:00Z"});
    expect(await hasPro("2030-06-06T23:59:59Z"),"valid grace").toBe(true);
    expect(await hasPro("2030-06-07T00:00:00Z"),"expired grace").toBe(false);

    for(const terminal of ["past_due","canceled","expired","refunded","disputed"]){
      await transition(terminal,{paid_through:"2031-01-01T00:00:00Z",
        grace_until:"2031-01-01T00:00:00Z"});
      expect(await hasPro("2030-06-01T00:00:00Z"),
        terminal+" must not keep paid capability").toBe(false);
    }
  }finally{
    expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
  }
});
