/** Deterministic, full-filtered-history material summary. Claims are teacher-attested evidence, not inferred mastery. */
export type MaterialSummaryRow = {
  id:string;studentId:string;sessionId:string|null;resourceId:string;
  stage:"assigned"|"taught"|"completed";label:string|null;
};
const stageCount=()=>({assigned:0,taught:0,completed:0});
export function summarizeMaterialClaims(rows:MaterialSummaryRow[]){
  const students=new Set<string>();
  const sessions=new Set<string>();
  const groupSessionStages=new Set<string>();
  const studentMaterialStages=new Set<string>();
  const stages=stageCount();
  const resources=new Map<string,{resourceId:string;label:string|null;
    claims:ReturnType<typeof stageCount>;students:Set<string>;sessions:Set<string>}>();
  for(const row of rows){
    students.add(row.studentId);
    if(row.sessionId){
      sessions.add(row.sessionId);
      groupSessionStages.add(JSON.stringify([row.sessionId,row.resourceId,row.stage]));
    }
    studentMaterialStages.add(JSON.stringify([row.studentId,row.resourceId,row.stage]));
    stages[row.stage]++;
    let item=resources.get(row.resourceId);
    if(!item){
      item={resourceId:row.resourceId,label:row.label,claims:stageCount(),
        students:new Set(),sessions:new Set()};
      resources.set(row.resourceId,item);
    }
    item.claims[row.stage]++;
    item.students.add(row.studentId);
    if(row.sessionId)item.sessions.add(row.sessionId);
  }
  return {
    evidenceClaims:rows.length,studentCount:students.size,sessionCount:sessions.size,
    uniqueSessionMaterialStageCount:groupSessionStages.size,
    uniqueStudentMaterialStageCount:studentMaterialStages.size,
    stages,
    resources:[...resources.values()].map(r=>({
      resourceId:r.resourceId,label:r.label,stages:r.claims,
      studentCount:r.students.size,sessionCount:r.sessions.size,
    })).sort((a,b)=>(a.label??"").localeCompare(b.label??"")||a.resourceId.localeCompare(b.resourceId)),
  };
}
