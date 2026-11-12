import {z} from "zod";

const uuid=z.string().uuid();
const attendance=z.object({
 studentId:uuid,
 status:z.enum(["present","absent","late","excused","student_cancelled","teacher_cancelled"]),
 note:z.string().max(5000).default(""),
 noticeAt:z.string().datetime({offset:true}).optional(),
 cancelReason:z.string().max(1000).optional(),
 expectedUpdatedAt:z.string().datetime({offset:true}).nullable(),
}).strict().superRefine((row,ctx)=>{
 const cancelled=row.status==="student_cancelled"||row.status==="teacher_cancelled";
 if(row.status==="student_cancelled"&&!row.noticeAt)
  ctx.addIssue({code:"custom",message:"Student cancellation requires verified notice time"});
 if(!cancelled&&(row.noticeAt!==undefined||row.cancelReason!==undefined))
  ctx.addIssue({code:"custom",message:"Non-cancellation attendance cannot carry cancellation metadata"});
});

/** A final lesson decision covers exactly one snapshot of each frozen learner.
 * The server-side SQL transaction additionally compares against the live
 * immutable roster and checks absence or exact attendance-row revision.
 */
export const lessonCompletionSchema=z.object({
 sessionId:uuid,
 expectedUpdatedAt:z.string().datetime({offset:true}),
 idempotencyKey:uuid,
 attendance:z.array(attendance).min(1).max(50),
 lessonNote:z.string().max(10000).optional(),
 confirmed:z.literal(true),
}).strict().refine(v=>new Set(v.attendance.map(x=>x.studentId)).size===v.attendance.length,{
 message:"Every learner must appear once",
});

export type LessonCompletionInput=z.infer<typeof lessonCompletionSchema>;
