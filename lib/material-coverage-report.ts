/** Deterministic, source-grounded material coverage aggregation.
 * An assignment does NOT prove teaching, and a taught chapter does NOT prove mastery.
 */
export type MaterialEvidenceRow={
 id:string;student_id:string;session_id:string|null;resource_id:string;
 stage:"assigned"|"taught"|"completed";occurred_on:string;
 chess_learning_resources:{
  label:string;url:string;resource_type:string;provider_study_id:string|null;provider_chapter_id:string|null;
 }|null;
};
export type MaterialCoverageItem={
 resourceId:string;label:string;url:string;resourceType:string;
 providerStudyId:string|null;providerChapterId:string|null;
 assignmentStudentCount:number;taughtStudentCount:number;completedStudentCount:number;
 distinctTeachingEvents:number;assignmentEvidenceCount:number;
 teachingEvidenceCount:number;completionEvidenceCount:number;
 firstEvidenceDate:string;lastEvidenceDate:string;
};
export function materialCoverageSummary(rows:MaterialEvidenceRow[]){
 const byResource=new Map<string,{item:MaterialCoverageItem;
  assigned:Set<string>;taught:Set<string>;completed:Set<string>;events:Set<string>}>();
 const allStudents=new Set<string>(),allTeachingEvents=new Set<string>();
 let assignments=0,taught=0,completed=0;
 for(const row of rows){
  const source=row.chess_learning_resources;
  if(!source)continue;
  allStudents.add(row.student_id);
  let group=byResource.get(row.resource_id);
  if(!group){
   group={assigned:new Set(),taught:new Set(),completed:new Set(),events:new Set(),
    item:{resourceId:row.resource_id,label:source.label,url:source.url,
     resourceType:source.resource_type,providerStudyId:source.provider_study_id,
     providerChapterId:source.provider_chapter_id,
     assignmentStudentCount:0,taughtStudentCount:0,completedStudentCount:0,
     distinctTeachingEvents:0,assignmentEvidenceCount:0,teachingEvidenceCount:0,
     completionEvidenceCount:0,firstEvidenceDate:row.occurred_on,lastEvidenceDate:row.occurred_on,
    }};
   byResource.set(row.resource_id,group);
  }
  group.item.firstEvidenceDate=row.occurred_on<group.item.firstEvidenceDate?
   row.occurred_on:group.item.firstEvidenceDate;
  group.item.lastEvidenceDate=row.occurred_on>group.item.lastEvidenceDate?
   row.occurred_on:group.item.lastEvidenceDate;
  if(row.stage==="assigned"){
   group.assigned.add(row.student_id);group.item.assignmentEvidenceCount++;assignments++;
  }else if(row.stage==="taught"){
   group.taught.add(row.student_id);group.item.teachingEvidenceCount++;taught++;
   // One shared group session is one teaching event, even if many pupils attended.
   // Manual off-session attestations are distinct reported evidence, not proven time.
   const key=row.session_id?"session:"+row.session_id:"attestation:"+row.id;
   group.events.add(key);allTeachingEvents.add(key);
  }else if(row.stage==="completed"){
   group.completed.add(row.student_id);group.item.completionEvidenceCount++;completed++;
  }
 }
 const materials=[...byResource.values()].map(g=>({
  ...g.item,assignmentStudentCount:g.assigned.size,taughtStudentCount:g.taught.size,
  completedStudentCount:g.completed.size,distinctTeachingEvents:g.events.size,
 })).sort((a,b)=>a.label.localeCompare(b.label)||a.resourceId.localeCompare(b.resourceId));
 return {materials,
  totals:{resourceCount:materials.length,studentCount:allStudents.size,
   assignmentEvidenceCount:assignments,teachingEvidenceCount:taught,
   completionEvidenceCount:completed,distinctTeachingEvents:allTeachingEvents.size},
  evidenceDefinition:"teacher-attested, non-voided records only",
  teachingTimeExcluded:true,
  warnings:[
   "Assigned resources are not counted as taught or completed.",
   "A taught record is not automatically proof of mastery or attendance.",
   "Group session counts are deduplicated by session ID across participants.",
   "A past lesson without a material evidence record cannot be assigned material retrospectively without teacher review.",
  ],
 };
}
