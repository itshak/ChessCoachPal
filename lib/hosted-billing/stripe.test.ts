import {describe,expect,it} from "vitest";
import {hostedBillingReturnOrigin} from "@/lib/hosted-billing/stripe";

describe("hosted subscription return origin",()=>{
 it("accepts only a configured canonical HTTPS website origin",()=>{
  expect(hostedBillingReturnOrigin({NEXT_PUBLIC_SITE_URL:"https://chesscoachpal.com/"}))
   .toBe("https://chesscoachpal.com");
  expect(hostedBillingReturnOrigin({VERCEL_URL:"test.example.vercel.app"}))
   .toBe("https://test.example.vercel.app");
 });
 it("rejects injected host, credentials and untrusted redirect origins",()=>{
  for(const url of [
   "http://example.com","https://someone:secret@example.com",
   "https://example.com/phishing","https://example.com/?next=evil",
   "javascript:alert(1)","https://example.com/#redirect",
  ])expect(hostedBillingReturnOrigin({NEXT_PUBLIC_SITE_URL:url})).toBeNull();
 });
 it("fails closed in production without an explicitly configured public URL",()=>{
  expect(hostedBillingReturnOrigin({NODE_ENV:"production"})).toBeNull();
  expect(hostedBillingReturnOrigin({NODE_ENV:"development"})).toBe("http://localhost:3000");
 });
 it("allows loopback HTTP only for local development or configured local testing",()=>{
  expect(hostedBillingReturnOrigin({NEXT_PUBLIC_SITE_URL:"http://localhost:3000"}))
   .toBe("http://localhost:3000");
  expect(hostedBillingReturnOrigin({NEXT_PUBLIC_SITE_URL:"http://127.0.0.1:8080"}))
   .toBe("http://127.0.0.1:8080");
 });
});
