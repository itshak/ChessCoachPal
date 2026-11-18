/**
 * ADR-0015: fail-closed ordered live-transition ledger and baseline coupling.
 * SHA-256 pins prevent a reviewed deployment SQL script from silently changing.
 * The runtime must still enforce data preconditions and operator authorization.
 */
import {createHash} from "node:crypto";

const checksum = value => createHash("sha256").update(value).digest("hex");
const sqlIdentifier = value => value.toLowerCase().replace(/"/g, "");
const word = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isSha = value => /^[a-f0-9]{64}$/.test(value ?? "");

export function transitionContractErrors({sqlFiles,sql,manifest,transitionSources={}}) {
  const errors=[];
  if(!manifest || manifest.schemaVersion!==1 || typeof manifest.baseline!=="string" ||
     !Array.isArray(manifest.transitions) || !Array.isArray(manifest.historicalAllowedSequences))
    return ["ADR-0015: reviewed transition manifest is missing or malformed"];
  const files=manifest.transitions.map(item=>item.file);
  if(new Set(files).size!==files.length || files.some((file,i)=>!/^[0-9]{14}_[a-z0-9_]+\.sql$/.test(file) ||
    (i>0 && file<=files[i-1])))
    errors.push("ADR-0015: transition manifest must have unique chronological SQL filenames");
  if(sqlFiles[0]!==manifest.baseline)
    errors.push("ADR-0015: canonical fresh-install baseline must be first");
  if(!isSha(manifest.baselineSha256) || checksum(sql)!==manifest.baselineSha256)
    errors.push("ADR-0015: baseline SQL changed without updating the reviewed transition manifest");
  const actual=sqlFiles.slice(1);
  const allowed=manifest.historicalAllowedSequences.some(sequence=>
    Array.isArray(sequence) && sequence.length===actual.length &&
    sequence.every((file,i)=>file===actual[i]));
  if(!allowed)
    errors.push("ADR-0015: unreviewed live transition or unsupported migration order");
  for(const [i,item] of manifest.transitions.entries()){
    if(!item || !files.includes(item.file) || !isSha(item.sha256) ||
       !item.fromRevision || !item.purpose || !item.risk ||
       item.requiresVerifiedRestore!==true ||
       !Array.isArray(item.baselineObjects) || !item.baselineObjects.length)
      errors.push("ADR-0015: transition metadata incomplete at index "+i);
    if(!(item.file in transitionSources) || checksum(transitionSources[item.file])!==item.sha256)
      errors.push("ADR-0015: reviewed SQL checksum mismatch or missing: "+item.file);
    for(const name of item.baselineObjects ?? []){
      const identifier=sqlIdentifier(name);
      const normalized=sqlIdentifier(sql);
      if(identifier.includes(".")){
        const [table,column]=identifier.split(".");
        if(!new RegExp('(?:create table(?: if not exists)?\\s+public\\.'+word(table)+'\\s*\\(|alter table\\s+public\\.'+word(table)+')','i').test(normalized) ||
           !new RegExp('\\b'+word(column)+'\\b','i').test(normalized))
          errors.push("ADR-0015: baseline is missing transition-owned field "+name);
      } else if (!new RegExp('\\bcreate\\s+(?:or\\s+replace\\s+)?(?:function|table)(?:\\s+if\\s+not\\s+exists)?\\s+public\\.'+word(identifier)+'\\b','i').test(normalized))
        errors.push("ADR-0015: baseline is missing transition-owned object "+name);
    }
  }
  return errors;
}

export const calculateTransitionChecksum = checksum;
