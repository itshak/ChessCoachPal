/**
 * Structural pre-v1 release gate: exactly one actual-lesson model.
 * Recurrence intent (lesson_slots) is not a second occurrence ledger.
 * Presence of a unified history reader does not make two writers equivalent.
 */
const oldTables=["lessons","attendance","lesson_notes"];
const canonicalTables=["teaching_sessions","session_participants","session_attendance"];
export function hasLessonTable(sql,name){
 const pattern='\\bCREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?'+
   '(?:(?:"?public"?\\.)?)"?'+name+'"?(?=\\s*\\()';
 return new RegExp(pattern,"i").test(sql);
}
export function canonicalOccurrenceSchemaErrors(sql){
 const errors=[];
 for(const name of canonicalTables)
  if(!hasLessonTable(sql,name))errors.push("missing canonical physical table: "+name);
 for(const name of oldTables)
  if(hasLessonTable(sql,name))errors.push("obsolete physical table: "+name);
 return errors;
}
export function competingLessonModels(sql){
 return oldTables.some(name=>hasLessonTable(sql,name)) &&
   canonicalTables.some(name=>hasLessonTable(sql,name));
}

