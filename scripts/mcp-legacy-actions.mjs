// The legacy /api/agent/v1 gateway contains 33 discriminated actions in one
// route family. A single MCP tool-name assertion for that route misses feature
// drift. Review every action and its exact MCP counterpart, or a narrowly
// approved secure browser-only teacher verification step.
export const legacyActionTools=Object.freeze({
  "workplaces.list":"ccp_v1_workplaces_list",
  "workplaces.create":"ccp_v1_workplaces_create",
  "workplaces.update":"ccp_v1_workplaces_update",
  "workplaces.enroll":"ccp_v1_workplaces_enroll",
  "workplaces.unenroll":"ccp_v1_workplaces_unenroll",
  "workplaces.enrollments":"ccp_v1_workplaces_enrollments",
  "students.create":"ccp_v1_students_create",
  "students.update":"ccp_v1_students_update",
  "students.search":"ccp_v1_students_search",
  "groups.list":"ccp_v1_groups_list",
  "groups.create":"ccp_v1_groups_create",
  "groups.update":"ccp_v1_groups_update",
  "groups.enroll":"ccp_v1_groups_enroll",
  "groups.unenroll":"ccp_v1_groups_unenroll",
  "groups.members":"ccp_v1_groups_members",
  "sessions.list":"ccp_v1_sessions_list",
  "sessions.create":"ccp_v1_sessions_create",
  "sessions.createAdHoc":"ccp_v1_sessions_ad_hoc_create",
  "sessions.update":"ccp_v1_sessions_edit",
  "sessions.participants":"ccp_v1_sessions_participants",
  "attendance.list":"ccp_v1_attendance_preview",
  "attendance.record":"ccp_v1_attendance_record",
  "chess.categories.list":"ccp_v1_chess_categories_list",
  "chess.categories.create":"ccp_v1_chess_categories_create",
  "chess.categories.update":"ccp_v1_chess_categories_update",
  "chess.categories.deleteImpact":"ccp_v1_chess_categories_delete_impact",
  "chess.categories.delete":"ccp_v1_chess_categories_delete",
  "chess.observations.list":"ccp_v1_chess_observations_list",
  "chess.observations.create":null,
  "chess.observations.propose":"ccp_v1_chess_observations_propose",
  "chess.observations.update":"ccp_v1_chess_observations_update",
  "chess.observations.approve":null,
  "chess.resources.list":"ccp_v1_chess_resources_list",
  "chess.resources.link":"ccp_v1_chess_resources_link",
  "chess.resources.update":"ccp_v1_chess_resources_update",
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
  const live=new Set([...catalogueSource.matchAll(/\bname\s*:\s*["'](ccp_v1_[a-z0-9_]+)["']/g)]
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
