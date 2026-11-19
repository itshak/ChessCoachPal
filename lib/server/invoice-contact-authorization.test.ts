import {describe,expect,it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {approvedInvoiceRecipient,type InvoiceBillingContact}
  from "@/lib/server/invoice-contact-authorization";

const teacherId="00000000-0000-4000-8000-000000000001";
const contactId="00000000-0000-4000-8000-000000000002";
const one="00000000-0000-4000-8000-000000000003";
const two="00000000-0000-4000-8000-000000000004";
const invoiceId="00000000-0000-4000-8000-000000000005";
const account:InvoiceBillingContact={
  id:"00000000-0000-4000-8000-000000000006",
  display_name:"The school",account_kind:"organization",contact_id:contactId,
  contacts:{id:contactId,display_name:"School coordinator",
    email:"school@example.invalid",preferred_locale:"he",status:"active"},
};
type Row=Record<string,unknown>;
function fakeDb(inputs:{
  lines:Row[];packages?:Row[];links?:Row[];failTable?:string
}):SupabaseClient{
  const rows:Record<string,Row[]>={
    invoice_items:inputs.lines,credit_packages:inputs.packages??[],
    student_contacts:inputs.links??[],
  };
  return {from(table:string){
    let values=[...(rows[table]??[])];
    const builder={
      select(_columns:string){return builder;},
      eq(field:string,value:unknown){
        values=values.filter(row=>row[field]===value);return builder;
      },
      in(field:string,value:unknown[]){
        values=values.filter(row=>value.includes(row[field]));return builder;
      },
      order(_field:string){return builder;},
      then(resolve:(arg:{data:Row[];error:{message:string}|null})=>void){
        resolve(inputs.failTable===table?
          {data:[],error:{message:"failure"}}:{data:values,error:null});
      },
    };
    return builder;
  }} as unknown as SupabaseClient;
}
const line=(studentId:string):Row=>({invoice_id:invoiceId,kind:"lesson",student_id:studentId});
const allow=(studentId:string):Row=>({teacher_id:teacherId,contact_id:contactId,
  student_id:studentId,may_receive_messages:true,active_from:null,active_to:null});

describe("explicit billing-contact authority",()=>{
  it("sends only to the explicitly linked current contact for every line",async()=>{
    const db=fakeDb({lines:[line(one),line(two)],links:[allow(one),allow(two)]});
    await expect(approvedInvoiceRecipient(db,teacherId,invoiceId,account))
      .resolves.toEqual({email:"school@example.invalid",
        displayName:"School coordinator",locale:"he"});
  });
  it("does not leak mixed private/school invoices through a partial contact link",async()=>{
    const db=fakeDb({lines:[line(one),line(two)],links:[allow(one)]});
    await expect(approvedInvoiceRecipient(db,teacherId,invoiceId,account))
      .resolves.toBeNull();
  });
  it("rejects absent or revoked messaging permission",async()=>{
    for(const links of [
      [{...allow(one),may_receive_messages:false}],[],
      [{...allow(one),active_to:"2000-01-01"}],
    ]){
      const db=fakeDb({lines:[line(one)],links});
      await expect(approvedInvoiceRecipient(db,teacherId,invoiceId,account))
        .resolves.toBeNull();
    }
  });
  it("requires one identifiable student for prepaid-credit purchases",async()=>{
    const data={lines:[{invoice_id:invoiceId,kind:"credit_package",student_id:null}],links:[allow(one)]};
    await expect(approvedInvoiceRecipient(fakeDb({...data,
      packages:[{teacher_id:teacherId,invoice_id:invoiceId,student_id:one}]}),teacherId,invoiceId,account))
      .resolves.toMatchObject({email:"school@example.invalid"});
    await expect(approvedInvoiceRecipient(fakeDb(data),teacherId,invoiceId,account))
      .resolves.toBeNull();
  });
  it("never sends for archived/unknown payer contact or missing student attribution",async()=>{
    await expect(approvedInvoiceRecipient(fakeDb({lines:[line(one)]}),
      teacherId,invoiceId,{...account,contacts:null})).resolves.toBeNull();
    await expect(approvedInvoiceRecipient(fakeDb({lines:[{invoice_id:invoiceId,kind:"lesson",student_id:null}]}),
      teacherId,invoiceId,account)).resolves.toBeNull();
  });
  it("fails closed when the permission query fails",async()=>{
    const db=fakeDb({lines:[line(one)],links:[allow(one)],
      failTable:"student_contacts"});
    await expect(approvedInvoiceRecipient(db,teacherId,invoiceId,account))
      .rejects.toThrow(/permission/i);
  });
});
