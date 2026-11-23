import {describe,expect,it} from "vitest";
import {filterContactsByDisplayName} from "./contact-search";

const people=[
 {id:"1",displayName:"  Ａlpha   School",email:"private@example.invalid"},
 {id:"2",displayName:"Alpha School",email:null},
 {id:"3",displayName:"אחוזה%_",email:null},
];
describe("contact display-name matching",()=>{
 it("returns all normalized homonyms in their original order",()=>{
  expect(filterContactsByDisplayName(people," ALPHA   school ")).toEqual(people.slice(0,2));
 });
 it("treats punctuation literally and never consults private attributes",()=>{
  expect(filterContactsByDisplayName(people,"%_")).toEqual([people[2]]);
  expect(filterContactsByDisplayName(people,"private")).toEqual([]);
 });
 it("retains existing unfiltered and blank behavior",()=>{
  expect(filterContactsByDisplayName(people,"")).toBe(people);
  expect(filterContactsByDisplayName(people,"  ")).toBe(people);
 });
});
