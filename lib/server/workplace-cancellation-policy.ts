import {z} from "zod";

/** NULL means inherit the teacher's typed default. Zero is an override. */
export const workplaceCancellationWindowInput=z.number().int().min(0).max(8760).nullable();
export type CancellationPolicySnapshotOrigin="observed"|"restored_unverified";
