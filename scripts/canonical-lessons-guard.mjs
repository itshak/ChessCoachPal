/** Structural release guard: the pre-v1 product has exactly one persisted
 * actual-lesson/attendance model. A common history reader or matching MCP
 * tool names never make two independent writers equivalent.
 *
 * Do not add compatibility views/aliases to bypass this assertion. Remove
 * the former physical occurrence/attendance tables after moving all retained
 * billing, recurring, portal and reporting code to canonical sessions.
 */
export function competingLessonModels(sql){
  const table = name => new RegExp(
    'CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:"public"\\.)?"'+name+'"\\s*\\(',
    'i'
  ).test(sql);
  return table("lessons") && table("attendance") &&
    table("teaching_sessions") && table("session_attendance");
}
