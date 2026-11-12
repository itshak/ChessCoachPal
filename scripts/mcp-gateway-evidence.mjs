/** Verified browser/delegated-MCP parity for each legacy coaching gateway
 * discriminator. Do not treat a list of matching tool names as behavioral
 * equality. The same named PARITY E2E must call the actual website action and
 * its corresponding delegated MCP tool, with at least one assertion. */
import {readdirSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {legacyActionTools,narrowBrowserExceptions} from "./mcp-legacy-actions.mjs";

const escapeRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");

export function validateGatewayActionE2E(root){
 const evidence=new Map();
 const tests=[];
 const filenames=readdirSync(join(root,"e2e")).filter(name=>name.endsWith(".spec.ts"));
 for(const filename of filenames){
  const path="e2e/"+filename,src=readFileSync(join(root,path),"utf8");
  // A test title is an independently executable and identifiable Playwright
  // action. Only full PARITY tests, never skipped/fixme declarations, count.
  const anchors=[...src.matchAll(/\btest(?:\.skip|\.fixme)?\(\s*(["'])([^"']+)\1\s*,/g)];
  for(let i=0;i<anchors.length;i++){
   const item=anchors[i];
   if(!item[2].startsWith("PARITY:PARITY-")||
      /^test\.(?:skip|fixme)/.test(item[0]))continue;
   const segment=src.slice(item.index,anchors[i+1]?.index??src.length);
   tests.push({path,name:item[2],body:segment});
  }
 }
 const errors=[];
 for(const [action,tool] of Object.entries(legacyActionTools)){
  const actionRe=new RegExp("\\baction\\s*:\\s*[\"']"+escapeRe(action)+"[\"']");
  if(tool===null){
   if(!narrowBrowserExceptions[action]){
    errors.push("No approved browser-only exception for "+action);
    continue;
   }
   const matches=tests.filter(test=>actionRe.test(test.body)&&
     test.body.includes("/api/agent/v1")&&test.body.includes("expect(")&&
     test.body.includes("BROWSER_APPROVAL_REQUIRED")&&
     test.body.includes("403")&&test.body.includes("Bearer"));
   if(matches.length===0)errors.push("No named PARITY browser approval E2E for "+action);
   else evidence.set(action,matches.map(x=>x.path+"#"+x.name));
   continue;
  }
  const toolRe=new RegExp("\\b(?:call|callTool)\\s*\\(\\s*[\"']"+
    escapeRe(tool)+"[\"']");
  const matches=tests.filter(test=>actionRe.test(test.body)&&
   toolRe.test(test.body)&&test.body.includes("/api/agent/v1")&&
   test.body.includes("expect("));
  if(matches.length===0)
   errors.push("No authenticated direct website/MCP PARITY scenario for "+action+" -> "+tool);
  else evidence.set(action,matches.map(x=>x.path+"#"+x.name));
 }
 return {errors,evidence,actions:Object.keys(legacyActionTools).length};
}
