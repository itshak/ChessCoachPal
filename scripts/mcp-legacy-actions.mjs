// The legacy /api/agent/v1 gateway contains 33 discriminated actions in one
// route family. A single MCP tool-name assertion for that route misses feature
// drift. Review every action and its exact MCP counterpart, or a narrowly
// approved secure browser-only teacher verification step.
export const legacyActionTools=Object.freeze({
  "workplaces.list":"ccp_workplaces_list",
  "workplaces.create":"ccp_workplaces_create",
  "workplaces.update":"ccp_workplaces_update",
  "workplaces.enroll":"ccp_workplaces_enroll",
  "workplaces.unenrollPreview":"ccp_workplaces_unenroll_preview",
  "workplaces.unenroll":"ccp_workplaces_unenroll",
  "workplaces.enrollments":"ccp_workplaces_enrollments",
  "credits.adjustmentPreview":"ccp_credits_adjustment_preview",
  "credits.adjustmentCommit":"ccp_credits_adjustment_commit",
  "students.create":"ccp_students_create",
  "students.update":"ccp_students_update",
  "students.search":"ccp_students_search",
  "students.lifecyclePreview":"ccp_students_lifecycle_preview",
  "students.lifecycleCommit":"ccp_students_lifecycle_commit",
  "groups.list":"ccp_groups_list",
  "groups.create":"ccp_groups_create",
  "groups.update":"ccp_groups_update",
  "groups.enroll":"ccp_groups_enroll",
  "groups.unenroll":"ccp_groups_unenroll",
  "groups.members":"ccp_groups_members",
  "sessions.list":"ccp_sessions_list",
  "sessions.create":"ccp_sessions_create",
  "sessions.createAdHoc":"ccp_sessions_ad_hoc_create",
  "sessions.update":"ccp_sessions_edit",
  "sessions.complete":"ccp_sessions_complete",
  "sessions.participants":"ccp_sessions_participants",
  "attendance.list":"ccp_attendance_preview",
  "attendance.record":"ccp_attendance_record",
  "attendance.bulkRecord":"ccp_attendance_bulk_record",
  "chess.categories.list":"ccp_chess_categories_list",
  "chess.categories.create":"ccp_chess_categories_create",
  "chess.categories.update":"ccp_chess_categories_update",
  "chess.categories.deleteImpact":"ccp_chess_categories_delete_impact",
  "chess.categories.delete":"ccp_chess_categories_delete",
  "chess.observations.list":"ccp_chess_observations_list",
  "chess.observations.create":null,
  "chess.observations.propose":"ccp_chess_observations_propose",
  "chess.observations.update":"ccp_chess_observations_update",
  "chess.observations.approve":null,
  "materials.links.list":"ccp_material_links_list",
  "materials.links.create":"ccp_material_links_create",
  "materials.links.update":"ccp_material_links_update",
  "materials.links.unlinkImpact":"ccp_material_links_unlink_impact",
  "materials.links.unlink":"ccp_material_links_unlink",
});
export const narrowBrowserExceptions=Object.freeze({
  "chess.observations.create":
    "Teacher-origin verified observation; bearer-created records must never attest teacher verification.",
  "chess.observations.approve":
    "Human teacher approves proposed observation through authenticated, same-origin browser.",
});
export function validateLegacyActionCoverage(gatewaySource,catalogueSource) {
  const errors=[];
  const actions=[...gatewaySource.matchAll(/\baction\s*:\s*z\.literal\(["']([^"']+)["']\)/g)]
    .map(m=>m[1]);
  const current=new Set(actions);
  if(current.size!==actions.length)errors.push("Legacy gateway has duplicate action discriminator");
  for(const action of current)
    if(!(action in legacyActionTools))
      errors.push("Unreviewed legacy website action: "+action+"; add an MCP counterpart or narrowly reviewed browser approval");
  for(const action of Object.keys(legacyActionTools))
    if(!current.has(action))
      errors.push("Stale legacy action mapping: "+action);
  const live=new Set([...catalogueSource.matchAll(/\bname\s*:\s*["'](ccp_[a-z0-9_]+)["']/g)]
    .map(m=>m[1]));
  for(const [action,tool] of Object.entries(legacyActionTools)) {
    if(tool===null){
      if(!narrowBrowserExceptions[action])
        errors.push("Unjustified browser-only business action: "+action);
      if(!gatewaySource.includes('call.action==="'+action+'"') ||
        !gatewaySource.includes("auth.bearer"))
        errors.push("Teacher provenance browser exception lacks bearer guard: "+action);
    }else if(!live.has(tool)){
      errors.push("Missing registered MCP tool "+tool+" for website action "+action);
    }
  }
  return errors;
}
