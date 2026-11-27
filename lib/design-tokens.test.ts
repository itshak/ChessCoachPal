import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
function tokens(block:string){return Object.fromEntries([...block.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6});/g)].map(m=>[m[1],m[2]]));}
function luminance(hex:string){const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];}
function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
describe("production semantic contrast",()=>{
 for(const [name,block] of [["dark",css.match(/@theme \{([\s\S]*?)\n\}/)![1]],["light",css.match(/\[data-teacher-theme="light"\] \{([\s\S]*?)\n\}/)![1]]]){
  it(name+" text and interactive boundaries",()=>{const t=tokens(block);for(const bg of ["background","surface","surface-dim"]){for(const fg of ["foreground","muted","primary","primary-dark","accent","success","warning","error"])expect(contrast(t[fg],t[bg]),fg+" on "+bg).toBeGreaterThanOrEqual(4.5);expect(contrast(t.border,t[bg])).toBeGreaterThanOrEqual(3);}
  for(const role of ["primary","success","success-light","warning","error"])expect(contrast(t[role],t["on-"+role]),role).toBeGreaterThanOrEqual(4.5);});
 }
});
