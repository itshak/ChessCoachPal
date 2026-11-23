import {describe,expect,it} from "vitest";
import {completePortalFinanceRows} from "./portal-finance-scope";

describe("portal finance accounting completeness",()=>{
 it("accepts exact empty/full evidence",()=>{
  expect(completePortalFinanceRows([],0)).toEqual([]);
  const rows=[{id:"a"},{id:"b"}];
  expect(completePortalFinanceRows(rows,2)).toBe(rows);
 });
 it("fails closed for rows or metadata missing at a gateway boundary",()=>{
  expect(completePortalFinanceRows(null,0)).toBeNull();
  expect(completePortalFinanceRows([{id:"a"}],null)).toBeNull();
  expect(completePortalFinanceRows([{id:"a"}],2)).toBeNull();
  expect(completePortalFinanceRows(Array.from({length:1001},()=>null),1001)).toBeNull();
 });
});
