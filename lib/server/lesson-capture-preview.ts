import "server-only";
import {teacherStudyPreferenceResolve} from "@/lib/server/teacher-study-preferences";
import {createHash} from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSessionSchedule } from "@/lib/server/coach-service";
import { isDateString } from "@/lib/schedule";
import {teacherStudyIndexSearch} from "@/lib/server/teacher-study-index";
import { inferOwnedWeeklyLessonTime,lessonIntervalConflicts,type LessonTiming } from "@/lib/server/lesson-schedule-inference";

/**
 * This is a read-only, deterministic capture PREVIEW, not an AI guess or a
 * scheduling write. The user must still confirm the stable IDs and exact time
 * before invoking the existing idempotent sessions.createAdHoc operation.
 */
const uuid = z.string().uuid();
export const lessonCapturePreviewSchema = z.object({
  names: z.array(z.string().trim().min(1).max(120)).min(2).max(50),
  workplaceId: uuid.optional(),
  title: z.string().trim().min(1).max(160),
  startsAt: z.string().datetime({ offset: true }).optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  localDate: z.string().refine(isDateString,"Date must be a real YYYY-MM-DD local calendar date").optional(),
  lessonNote: z.string().max(10000).default(""),
  chapterSelection:z.object({
    studyId:z.string().regex(/^[A-Za-z0-9]{8}$/).optional(),
    studyName:z.string().trim().min(1).max(160).optional(),
    chapterNumber:z.number().int().min(1).max(64),
    expectedPlayers:z.string().trim().max(120).optional(),
  }).strict().refine(x=>!(x.studyId&&x.studyName),
    "Use an explicit study ID or title, or omit both to resolve the saved preference").optional(),
}).strict().refine(x=>
  (x.startsAt!==undefined&&x.durationMinutes!==undefined&&x.localDate===undefined) ||
  (x.startsAt===undefined&&x.durationMinutes===undefined&&x.localDate!==undefined),
  "Supply an explicit start and duration, OR one local date for unique slot inference");

export type LessonCapturePreviewInput = z.infer<typeof lessonCapturePreviewSchema>;

export class LessonCapturePreviewError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

// Unicode normalization is only for exact teacher-owned identity matches;
// never use fuzzy/substring guessing, translation or automatic transliteration.
export function normalizeStudentIdentity(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

type StudentIdentity = { id: string; name: string; name_aliases: string[] | null };
type Workplace = { id: string; name: string; timezone: string };
type ResolutionIssue = {
  code: "NOT_FOUND" | "AMBIGUOUS_STUDENT" | "DUPLICATE_STUDENT" |
    "NO_COMMON_WORKPLACE" | "AMBIGUOUS_WORKPLACE" | "WORKPLACE_NOT_FOUND" |
    "STUDENT_NOT_ENROLLED"|"MISSING_SCHEDULE"|"TIME_AMBIGUOUS"|
    "DST_UNRESOLVED"|"SCHEDULE_CONFLICT"|"CHAPTER_NOT_FOUND"|
    "CHAPTER_AMBIGUOUS"|"CHAPTER_STALE"|"CHAPTER_PLAYERS_MISMATCH";
  message: string;
  input?: string;
  candidates?: Array<{ id: string; name: string }>;
  inputs?: string[]; // distinct names/aliases referencing the same learner in one roster
};

const fail = (code: string, message: string) =>
  new LessonCapturePreviewError(503, code, message);

async function activeStudents(db: SupabaseClient, teacherId: string) {
  const rows: StudentIdentity[] = [];
  const batch = 250;
  // Self-hosted teachers may have more than 1,000 historical students.
  // A truncated roster is unsafe: a duplicate alias after the first page
  // must not silently turn an ambiguous identity into an exact match.
  for (let offset = 0; offset < 20000; offset += batch) {
    const { data, error } = await db.from("students")
      .select("id,name,name_aliases")
      .eq("teacher_id", teacherId).is("archived_at", null)
      .order("id").range(offset, offset + batch - 1);
    if (error || !data) throw fail("ROSTER_UNAVAILABLE", "Student identity lookup unavailable");
    rows.push(...data as StudentIdentity[]);
    if (data.length < batch) return rows;
  }
  throw fail("ROSTER_LIMIT", "Too many students for safe unambiguous name resolution");
}


export const studentNamesResolveSchema=z.object({
 names:z.array(z.string().trim().min(1).max(120)).min(1).max(100),
}).strict();

/** Exact owner-owned report-name and alias resolver shared by all capture flows.
 * No fuzzy guesses, archived learners, guardian contact or provider credentials.
 */
export async function teacherStudentNamesResolve(
 db:SupabaseClient,teacherId:string,names:string[],
){
 const parsed=studentNamesResolveSchema.parse({names});
 const input=parsed;
  const students = await activeStudents(db, teacherId);
  const lookup = new Map<string, StudentIdentity[]>();
  for (const student of students) {
    const variants = [student.name, ...(Array.isArray(student.name_aliases) ? student.name_aliases : [])];
    for (const key of new Set(variants.map(normalizeStudentIdentity).filter(Boolean))) {
      const matches = lookup.get(key) ?? [];
      matches.push(student);
      lookup.set(key, matches);
    }
  }

  const issues: ResolutionIssue[] = [];
  const resolutions = input.names.map(name => {
    const matches = lookup.get(normalizeStudentIdentity(name)) ?? [];
    if (matches.length === 0) {
      issues.push({ code: "NOT_FOUND", input: name,
        message: "No active student has this exact name or alias" });
    } else if (matches.length > 1) {
      issues.push({ code: "AMBIGUOUS_STUDENT", input: name,
        message: "Multiple students share this name or alias; choose the stable student ID",
        candidates: matches.map(s => ({ id: s.id, name: s.name })) });
    }
    return { input: name, status: matches.length === 1 ? "resolved" as const :
      matches.length === 0 ? "not_found" as const : "ambiguous" as const,
      studentId: matches.length === 1 ? matches[0].id : null,
      name: matches.length === 1 ? matches[0].name : null,
      candidates: matches.length > 1 ? matches.map(s => ({ id: s.id, name: s.name })) : [] };
  });

  const ids = resolutions.map(r => r.studentId).filter((id): id is string => id !== null);
  const byStudent = new Map<string, typeof resolutions>();
  for(const resolution of resolutions){
    if(!resolution.studentId)continue;
    const refs=byStudent.get(resolution.studentId)??[];
    refs.push(resolution);
    byStudent.set(resolution.studentId,refs);
  }
  for(const [id,refs] of byStudent){
    if(refs.length>1){
      issues.push({
        code:"DUPLICATE_STUDENT",
        message:"These roster inputs refer to the same learner, not duplicate student records. Use one name or alias per learner.",
        candidates:[{id,name:refs[0].name!}],
        inputs:refs.map(r=>r.input),
      });
    }
  }

 return {resolutions,issues,allResolved:issues.length===0,
  // Nonempty studentIds means safe to commit a roster. Preserve successful
  // resolution information separately even when a duplicated alias blocks commit.
  studentIds:issues.length===0?ids:[],
  matchedStudentIds:[...byStudent.keys()],
  explanation:"Names and aliases may both resolve to one existing student; duplicate roster references must be corrected before committing. Archived students and partial matches are never auto-selected."};
}

/** Match only active learners within this teacher, then find their common workplace. */
export async function teacherLessonCapturePreview(
  db: SupabaseClient, teacherId: string, input: LessonCapturePreviewInput,
) {
  if(input.startsAt!==undefined&&input.durationMinutes!==undefined)
    assertSessionSchedule(input.startsAt,input.durationMinutes);
  const identity=await teacherStudentNamesResolve(db,teacherId,input.names);
  const {resolutions,issues}=identity;
  const ids=resolutions.map(r=>r.studentId).filter((id):id is string=>id!==null);

  let selectedWorkplace: Workplace | null = null;
  const enrolledByStudent = new Map<string, Set<string>>();
  if (ids.length > 0) {
    // PostgREST installations commonly cap responses at 1,000 rows even when
    // the requested range is larger. Page deterministically: a truncated
    // enrollment query could falsely exclude a valid second workplace.
    const batch = 250;
    let exhausted = false;
    for (let offset = 0; offset < 20000; offset += batch) {
      const { data, error } = await db.from("workplace_enrollments")
        .select("student_id,workplace_id")
        .eq("teacher_id", teacherId).in("student_id", [...new Set(ids)])
        .order("student_id").order("workplace_id")
        .range(offset, offset + batch - 1);
      if (error || !data)
        throw fail("ENROLLMENTS_UNAVAILABLE", "Cannot verify workplace enrollment safely");
      for (const row of data) {
        const values = enrolledByStudent.get(row.student_id) ?? new Set<string>();
        values.add(row.workplace_id);
        enrolledByStudent.set(row.student_id, values);
      }
      if (data.length < batch) { exhausted = true; break; }
    }
    if (!exhausted)
      throw fail("ENROLLMENTS_LIMIT", "Too many enrollments for an unambiguous preview");
  }

  if (input.workplaceId) {
    const { data, error } = await db.from("workplaces")
      .select("id,name,timezone")
      .eq("teacher_id", teacherId).eq("id", input.workplaceId).maybeSingle();
    if (error) throw fail("WORKPLACE_UNAVAILABLE", "Workplace lookup unavailable");
    if (!data) {
      issues.push({ code: "WORKPLACE_NOT_FOUND", message: "Specified workplace is unavailable" });
    } else {
      selectedWorkplace = data as Workplace;
      for (const r of resolutions) {
        if (r.studentId && !enrolledByStudent.get(r.studentId)?.has(data.id)) {
          issues.push({ code: "STUDENT_NOT_ENROLLED", input: r.input,
            message: "Student is not currently enrolled in the requested workplace" });
        }
      }
    }
  } else if (ids.length > 0 && ids.length === input.names.length &&
    new Set(ids).size === ids.length) {
    const common = [...(enrolledByStudent.get(ids[0]) ?? new Set<string>())]
      .filter(id => ids.every(studentId => enrolledByStudent.get(studentId)?.has(id)));
    if (common.length === 0) {
      issues.push({ code: "NO_COMMON_WORKPLACE",
        message: "No workplace contains every selected student; specify and review enrollments" });
    } else {
      const { data, error } = await db.from("workplaces")
        .select("id,name,timezone").eq("teacher_id", teacherId).in("id", common)
        .order("id").limit(100);
      if (error || !data || data.length !== common.length)
        throw fail("WORKPLACE_UNAVAILABLE", "Cannot verify common workplaces safely");
      if (data.length === 1) selectedWorkplace = data[0] as Workplace;
      else issues.push({ code: "AMBIGUOUS_WORKPLACE",
        message: "More than one workplace contains these students; choose one explicitly",
        candidates: data.map(w => ({ id: w.id, name: w.name })) });
    }
  }

  let timing:LessonTiming|null=input.startsAt!==undefined&&
    input.durationMinutes!==undefined ? {
      startsAt:input.startsAt,durationMinutes:input.durationMinutes,
      timeSource:"explicit",slotIds:[],
    }:null;
  if(selectedWorkplace&&issues.length===0&&ids.length===input.names.length){
    if(input.localDate){
      const inferred=await inferOwnedWeeklyLessonTime(
        db,teacherId,selectedWorkplace,input.localDate,ids);
      timing=inferred.timing;
      issues.push(...inferred.issues);
    }
    if(timing&&issues.length===0)
      issues.push(...await lessonIntervalConflicts(db,teacherId,timing));
  }
  // A numbered game is an authentic chapter of the teacher's indexed,
  // authorized Lichess study, never an LLM-invented "game number".
  // A stale or missing index requires explicit browser OAuth sync/review.
  let selectedChapter:null|{studyId:string;chapterId:string;
    chapterNumber:number;chapterName:string;studyName:string;
    white:string|null;black:string|null;verifiedAt:string;chapterUrl:string;
    source:"AUTHORIZED_LICHESS_PGN_CACHE";attached:false}=null;
  if(input.chapterSelection&&issues.length===0){
    const choice=input.chapterSelection;
    let resolvedStudyId=choice.studyId;
    if(!choice.studyId&&!choice.studyName&&selectedWorkplace){
      // A default is ONLY safe when all selected students resolve the same
      // exact teacher-authorized study after student > workplace > teacher
      // precedence. Never pick the first student's source silently.
      const preferences=await Promise.all(ids.map(studentId=>
        teacherStudyPreferenceResolve(db,teacherId,{
          purpose:"lesson",workplaceId:selectedWorkplace!.id,studentId,
        })));
      const distinct=new Set(preferences.map(p=>p.studyId).filter(Boolean));
      if(preferences.some(p=>!p.studyId)){
        issues.push({code:"CHAPTER_NOT_FOUND",
          message:"Some learners have no saved Lichess study preference; select an explicit study"});
      }else if(distinct.size!==1){
        issues.push({code:"CHAPTER_AMBIGUOUS",
          message:"Learners have different saved Lichess studies; choose one exact study for this shared lesson"});
      }else{
        resolvedStudyId=preferences[0].studyId??undefined;
      }
    }
    if(issues.length===0){
    const found=await teacherStudyIndexSearch(db,teacherId,{
      ...(resolvedStudyId?{studyId:resolvedStudyId}:{}),
      ...(choice.studyName?{query:choice.studyName}:{}),
      chapterNumber:choice.chapterNumber,limit:100,
    });
    // The index supports substring discovery, but a *capture* must use one
    // exact title or provider ID; an approximate match is never accepted.
    const candidates=(found.matches as Array<Record<string,unknown>&{
      stale:boolean;chapterUrl:string;
    }>).filter(c=>resolvedStudyId?
      c.study_id===resolvedStudyId:
      normalizeStudentIdentity(c.study_name as string)===
        normalizeStudentIdentity(choice.studyName!));
    if(found.truncated||candidates.length>1){
      issues.push({code:"CHAPTER_AMBIGUOUS",
        message:"Multiple cached chapters may match; use an exact study name or provider ID"});
    }else if(candidates.length===0){
      issues.push({code:"CHAPTER_NOT_FOUND",
        message:"No exact authorized indexed Lichess study/chapter number; sync with study:read first"});
    }else{
      const c=candidates[0];
      if(c.stale)issues.push({code:"CHAPTER_STALE",
        message:"Chapter metadata is older than 24 hours; re-sync the authorized study before capture"});
      if(choice.expectedPlayers){
        // E.g. "Steinitz–Chigorin" matches PGN "Wilhelm Steinitz"
        // versus "Mikhail Chigorin"; the intervening first name must not
        // trigger a false mismatch. Every requested name token is required.
        const tokens=normalizeStudentIdentity(choice.expectedPlayers)
          .split(/[\s\p{P}\p{S}]+/gu).filter(Boolean);
        const actual=normalizeStudentIdentity(
          [c.white_player,c.black_player].filter(Boolean).join(" "))
          .split(/[\s\p{P}\p{S}]+/gu).filter(Boolean);
        if(!tokens.length||tokens.some(t=>!actual.includes(t))){
          issues.push({code:"CHAPTER_PLAYERS_MISMATCH",
            message:"The indexed chapter players do not match the requested names; confirm actual chapter identity"});
        }
      }
      if(!issues.some(issue=>issue.code.startsWith("CHAPTER_"))){
        selectedChapter={
          studyId:c.study_id as string,chapterId:c.chapter_id as string,
          chapterNumber:c.chapter_number as number,
          chapterName:c.chapter_name as string,studyName:c.study_name as string,
          white:c.white_player as string|null,black:c.black_player as string|null,
          verifiedAt:c.verified_at as string,chapterUrl:c.chapterUrl,
          source:"AUTHORIZED_LICHESS_PGN_CACHE",attached:false,
        };
      }
    }
    }
  }
  const canCommit=issues.length===0&&selectedWorkplace!==null&&timing!==null;
  // A fresh indexed chapter can now be committed with a new lesson in ONE
  // PostgreSQL transaction. The IDs and expected source version are exactly
  // the ones already reviewed above; no identity, time or mastery is inferred.
  const proposedAtomicCommit=canCommit&&selectedChapter?{
    workplaceId:selectedWorkplace!.id,studentIds:ids,
    title:input.title,startsAt:timing!.startsAt,
    durationMinutes:timing!.durationMinutes,lessonNote:input.lessonNote,
    studyId:selectedChapter.studyId,chapterId:selectedChapter.chapterId,
    expectedVerifiedAt:selectedChapter.verifiedAt,
    expectedRosterHash:createHash("md5").update([...ids].sort().join(",")).digest("hex"),
    note:"Chapter assigned to reviewed frozen roster; mastery not inferred",
  }:null;
  return {
    canCommit,resolutions,issues,workplace:selectedWorkplace,
    selectedChapter,proposedAtomicCommit,
    proposedSession:canCommit ? {
      workplaceId:selectedWorkplace!.id,studentIds:ids,
      title:input.title,startsAt:timing!.startsAt,
      durationMinutes:timing!.durationMinutes,lessonNote:input.lessonNote,
    }:null,
    review:{
      creates:"One scheduled lesson with a frozen roster and unmarked attendance",
      instructorMinutes:timing?.durationMinutes??null,
      studentCount:ids.length,
      attendance:"unmarked",
      timeSource:timing?.timeSource??(input.localDate?"weekly_slot":"explicit"),
      slotIds:timing?.slotIds??[],
      localDate:input.localDate??null,
      timezone:selectedWorkplace?.timezone??null,
      inferredComprehension:false,writesPerformed:false,
      materialAssociation:"not_written",
      materialNextStep:selectedChapter?
        "Approve one combined atomic lesson+chapter commit to avoid partial writes, or use the original separately approved session and chapter operations. Both leave attendance unmarked and mastery unknown.":
        "No verified study chapter selected. Do not invent material history.",
      nextStep:selectedChapter?"For a scheduled lesson plus verified chapter use ccp_lessons_capture_commit_with_chapter with exact reviewed data, two request UUIDs and teacher approval; this leaves attendance unmarked. For a completed group lesson with explicit attendance instead use ccp_lessons_capture_completed (chapter association is separate).":"For a completed group lesson with explicit attendance for EACH student, confirm exact proposedSession fields and use ccp_lessons_capture_completed with participant-specific attendance notes, one requestId and confirmed=true. Otherwise schedule without attendance via ccp_sessions_ad_hoc_create.",
    },
  };
}
