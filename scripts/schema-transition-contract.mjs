/**
 * ADR-0017 — one current pre-v1 canonical schema and ONE future operational
 * cutover or clean rebuild/reimport. Historical incremental migration chains
 * are not a supported installation or compatibility contract.
 *
 * This source checksum/required-object guard is intentionally independent of
 * the privileged live operator decision. It never connects to a database.
 */
import {createHash} from "node:crypto";
const checksum=value=>createHash("sha256").update(value).digest("hex");
const isSha=value=>/^[a-f0-9]{64}$/.test(value??"");
const escapeRegex=value=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const normalized=value=>value.toLowerCase().replace(/"/g,"");

export function transitionContractErrors({sqlFiles,sql,manifest}){
  const errors=[];
  if(!manifest || manifest.schemaVersion!==2 ||
    manifest.mode!=="single-canonical-baseline" ||
    manifest.operatorCutoverRequired!==true ||
    typeof manifest.baseline!=="string" ||
    !Array.isArray(manifest.baselineRequiredObjects) ||
    !manifest.baselineRequiredObjects.length ||
    manifest.transitions!==undefined ||
    manifest.historicalAllowedSequences!==undefined)
    return ["ADR-0017: one-baseline manifest and separate operator cutover contract required"];
  if(sqlFiles.length!==1||sqlFiles[0]!==manifest.baseline)
    errors.push("ADR-0017: ONLY the canonical baseline may ship under supabase/migrations; no staged upgrade chain");
  if(!isSha(manifest.baselineSha256)||checksum(sql)!==manifest.baselineSha256)
    errors.push("ADR-0017: baseline SQL changed without review/checksum update");
  const source=normalized(sql);
  for(const name of manifest.baselineRequiredObjects){
    if(typeof name!=="string"||!/^[a-z][a-z0-9_]+$/.test(name)){
      errors.push("ADR-0017: invalid required-object identifier");continue;
    }
    const regex=new RegExp('\\bcreate\\s+(?:or\\s+replace\\s+)?(?:function|table)(?:\\s+if\\s+not\\s+exists)?\\s+public\\.'+escapeRegex(name)+'\\b','i');
    if(!regex.test(source))
      errors.push("ADR-0017: final canonical baseline missing required object "+name);
  }
  return errors;
}
export const calculateTransitionChecksum=checksum;
