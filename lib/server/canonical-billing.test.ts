import {describe,it,expect} from "vitest";
import {canonicalBillableStatus} from "./canonical-billing";
import {participantBillingKey} from "./canonical-billing-source";

describe("canonical participant finance adapter",()=>{
 it("keeps all teacher and student cancellation categories",()=>{
  expect(canonicalBillableStatus("present")).toBe("attended");
  expect(canonicalBillableStatus("late")).toBe("attended");
  expect(canonicalBillableStatus("absent")).toBe("no_show");
  expect(canonicalBillableStatus("excused")).toBeNull();
  expect(canonicalBillableStatus(null)).toBeNull();
  expect(canonicalBillableStatus("student_cancelled")).toBe("student_cancel");
  expect(canonicalBillableStatus("teacher_cancelled")).toBe("teacher_cancel");
  expect(()=>canonicalBillableStatus("unrecognized")).toThrow();
 });
 it("uses separate student-specific ledger identity within one group session",()=>{
  const session="11111111-1111-4111-8111-111111111111";
  const one=participantBillingKey(session,"22222222-2222-4222-8222-222222222222");
  const two=participantBillingKey(session,"33333333-3333-4333-8333-333333333333");
  expect(one).not.toBe(two);
  expect(one.split(":")[0]).toBe(two.split(":")[0]);
 });
});
