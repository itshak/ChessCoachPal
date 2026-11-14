import {expect,type APIRequestContext} from "@playwright/test";

type MailAddress={Address:string;Name?:string};
export type MailpitSummary={
 ID:string;Subject:string;To:MailAddress[];Created?:string;
};
/** CI's local Mailpit server captures synthetic SMTP; no external mail is sent. */
export async function mailpitMessagesTo(request:APIRequestContext,to:string){
 const url="http://127.0.0.1:54324/api/v1/search?query="+
   encodeURIComponent('to:"'+to+'"');
 const response=await request.get(url);
 expect(response.status(),await response.text()).toBe(200);
 const data=await response.json() as {messages:MailpitSummary[]};
 return (data.messages??[]).filter(message=>
   message.To?.some(recipient=>recipient.Address?.toLowerCase()===to.toLowerCase()));
}
