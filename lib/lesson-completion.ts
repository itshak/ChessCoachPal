import {z} from "zod";

const uuid=z.string().uuid();
const attendance=z.object({
 studentId:uuid,
 status:z.enum(["present","absent","late","excused"]),
 note:z.string().max(5000).default(""),
 expectedUpdatedAt:z.string().datetime({offset:true}),
}).strict();

/** A final lesson decision covers exactly one snapshot of each frozen learner.
 * The server-side SQL transaction additionally compares against the live
 * immutable roster and checks each attendance-row revision.
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
