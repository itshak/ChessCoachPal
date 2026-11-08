import type { SupabaseClient } from "@supabase/supabase-js";
import { familyDisplayName } from "@/lib/guardians";
import { oneToOne } from "@/lib/schedule";

type Db=SupabaseClient;
export class TeacherBillingError extends Error {
  constructor(public status:number,public code:string,message:string){super(message);}
}
const failure=(status:number,code:string,message:string)=>new TeacherBillingError(status,code,message);
export async function teacherInvoicesList(db:Db,teacherId:string,
  opts:{status?:string;offset?:number;limit?:number}={}){
  const limit=Math.min(100,Math.max(1,opts.limit??50)),offset=Math.max(0,opts.offset??0);
  let q=db.from("invoices").select(
    "id,status,subtotal_cents,currency,period_start,period_end,created_at,sent_at,paid_at,guardian_id,guardians(name,family_name)"
  ).eq("teacher_id",teacherId).order("created_at",{ascending:false})
    .range(offset,offset+limit);
  if(opts.status)q=q.eq("status",opts.status);
  const {data,error}=await q;
  if(error)throw failure(500,"DATABASE_ERROR","Invoices unavailable");
  return {invoices:(data??[]).slice(0,limit),nextOffset:(data?.length??0)>limit?offset+limit:null};
}
/** Same full owner-filtered record that the website invoice page reads.
 * Delegated MCP must strip portal tokens and confidential Stripe identifiers.
 */
export async function teacherInvoiceDetail(db:Db,teacherId:string,id:string){
  const {data,error}=await db.from("invoices").select(`
    *,
    guardians (id,name,family_name,email,secondary_email,email_recipients,portal_token),
    invoice_items (*),
    payments (*)
  `).eq("id",id).eq("teacher_id",teacherId).maybeSingle();
  if(error)throw failure(500,"DATABASE_ERROR","Invoice unavailable");
  if(!data)throw failure(404,"NOT_FOUND","Invoice not found");
  return data;
}
export function safeInvoice(invoice:Record<string,unknown>,showPrivate=false) {
  const {stripe_checkout_session_id,stripe_payment_intent_id,stripe_checkout_url,
    guardians,payments,...rest}=invoice;
  const family=oneToOne(guardians as Record<string,unknown>|Record<string,unknown>[]|null);
  const safeFamily=family?({
    id:family.id,name:family.name,family_name:family.family_name,
    ...(showPrivate?{email:family.email,secondary_email:family.secondary_email,
      email_recipients:family.email_recipients}:{}),
  }):null;
  const paymentList=(payments??[]) as Record<string,unknown>[];
  const sanitizedPayments=paymentList.map(({external_id,note,...summary})=>
    showPrivate?{...summary,external_id,note}:summary);
  return {...rest,guardians:safeFamily,payments:sanitizedPayments};
}
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
function csvValue(input:unknown){
  let value=String(input??"");
  // Prevent CSV formula execution when accountants open exports in Excel.
  if(/^[=+@-]/.test(value))value="'"+value;
  if(/[",\n\r]/.test(value))return '"'+value.replace(/"/g,'""')+'"';
  return value;
}
type InvoiceEmbed={id:string;period_start:string;period_end:string;currency:string;
  guardians:{name:string;family_name:string|null}|{name:string;family_name:string|null}[]|null};
export async function teacherPaymentsExport(db:Db,teacherId:string,opts:{from?:string;to?:string}={}){
  if((opts.from&&!datePattern.test(opts.from))||(opts.to&&!datePattern.test(opts.to))||
    (opts.from&&opts.to&&opts.from>opts.to))
    throw failure(400,"VALIDATION_ERROR","Provide an ordered YYYY-MM-DD accounting date range");
  const rows:string[]=[[
    "recorded_at","family","period_start","period_end","amount","currency",
    "method","external_id","note","invoice_id",
  ].join(",")];
  let offset=0,rowCount=0;
  for(;;){
    let query=db.from("payments").select(`
      id,amount_cents,method,external_id,recorded_at,note,
      invoices!inner(id,period_start,period_end,currency,teacher_id,guardians(name,family_name))
    `).eq("invoices.teacher_id",teacherId).order("recorded_at",{ascending:false})
      .order("id",{ascending:true}).range(offset,offset+499);
    if(opts.from)query=query.gte("recorded_at",opts.from+"T00:00:00.000Z");
    if(opts.to)query=query.lte("recorded_at",opts.to+"T23:59:59.999Z");
    const {data,error}=await query;
    if(error)throw failure(500,"DATABASE_ERROR","Unable to export payments");
    for(const payment of data??[]){
      const invoice=oneToOne(payment.invoices as InvoiceEmbed|InvoiceEmbed[]|null);
      if(!invoice)continue;
      const family=oneToOne(invoice.guardians);
      rows.push([
        payment.recorded_at,family?familyDisplayName(family):"",
        invoice.period_start,invoice.period_end,(payment.amount_cents/100).toFixed(2),
        invoice.currency,payment.method,payment.external_id??"",payment.note??"",invoice.id,
      ].map(csvValue).join(","));
      rowCount++;
    }
    if((data?.length??0)<500)break;
    offset+=500;
    if(offset>100000)throw failure(413,"EXPORT_TOO_LARGE","Use a narrower accounting date range");
  }
  return {csv:rows.join("\n")+"\n",rowCount};
}
