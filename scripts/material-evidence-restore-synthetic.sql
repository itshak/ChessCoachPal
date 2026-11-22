-- Canonical owner-only portable material history: disposable seeded DB only.
BEGIN;
CREATE TEMP TABLE synthetic_material_export(payload jsonb) ON COMMIT DROP;
GRANT SELECT,INSERT ON synthetic_material_export TO authenticated;
INSERT INTO auth.users(id,email)
 VALUES('00000000-0000-0000-0000-000000000002','material-neighbor@synthetic.invalid');
INSERT INTO public.teachers(id,email,display_name)
 VALUES('00000000-0000-0000-0000-000000000002','material-neighbor@synthetic.invalid','Synthetic second teacher');
INSERT INTO public.learning_materials(id,teacher_id,kind,title,source_url,request_id,request_hash) VALUES
 ('cc770000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000001',
  'external_link','Synthetic active material','https://example.invalid/active',gen_random_uuid(),repeat('a',64)),
 ('cc770000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000001',
  'external_link','Synthetic later archived material','https://example.invalid/archive',gen_random_uuid(),repeat('b',64));

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
INSERT INTO public.material_teaching_evidence(id,teacher_id,student_id,material_id,stage,occurred_on,
 note,request_id,created_at,learning_stage,stage_verified_at,stage_verified_by)
SELECT id,auth.uid(),'10000000-0000-0000-0000-000000000001',material_id,'taught','2024-02-01',
 'Source owner attestation',gen_random_uuid(),'2024-02-01 10:00Z','demonstrated',
 '2024-02-01 11:00Z',auth.uid()
FROM (VALUES
 ('cc770000-0000-4000-8000-000000000011'::uuid,'cc770000-0000-4000-8000-000000000001'::uuid),
 ('cc770000-0000-4000-8000-000000000012'::uuid,'cc770000-0000-4000-8000-000000000002'::uuid)
) fixtures(id,material_id);
UPDATE public.material_teaching_evidence
 SET voided_at='2024-02-02 11:00Z',void_reason='Teacher confirmed the correction.'
 WHERE id IN ('cc770000-0000-4000-8000-000000000011','cc770000-0000-4000-8000-000000000012');
INSERT INTO synthetic_material_export
 SELECT to_jsonb(e) FROM public.material_teaching_evidence e
 WHERE e.id IN ('cc770000-0000-4000-8000-000000000011','cc770000-0000-4000-8000-000000000012');

-- Simulate an empty history destination under the same logical owner. The
-- fixture never deletes external data or turns off triggers/constraints.
RESET ROLE;
DELETE FROM public.material_teaching_evidence
 WHERE id IN ('cc770000-0000-4000-8000-000000000011','cc770000-0000-4000-8000-000000000012');
UPDATE public.learning_materials
 SET archived_at=now(),revision=revision+1
 WHERE id='cc770000-0000-4000-8000-000000000002';

SET LOCAL ROLE authenticated;
DO $material_restore$
DECLARE
 source jsonb;
 archived_source jsonb;
 batch jsonb;
 result jsonb;
 prior public.material_teaching_evidence%ROWTYPE;
 prior_clock timestamptz;
 new_id uuid:=gen_random_uuid();
BEGIN
 SELECT payload INTO STRICT source FROM synthetic_material_export
 WHERE payload->>'id'='cc770000-0000-4000-8000-000000000011';
 SELECT payload INTO STRICT archived_source FROM synthetic_material_export
 WHERE payload->>'id'='cc770000-0000-4000-8000-000000000012';
 batch:=jsonb_build_object('material_teaching_evidence',jsonb_build_array(source));
 result:=public.ccp_teacher_backup_restore(batch,NULL,repeat('6',64));
 IF result->'counts'->>'material_teaching_evidence' IS DISTINCT FROM '1' THEN
  RAISE EXCEPTION 'MATERIAL_RESTORE_COUNT_WRONG';
 END IF;
 SELECT * INTO STRICT prior FROM public.material_teaching_evidence
  WHERE id=(source->>'id')::uuid;
 IF (to_jsonb(prior)-'updated_at') IS DISTINCT FROM (source-'updated_at') THEN
  RAISE EXCEPTION 'MATERIAL_RESTORED_HISTORY_CHANGED';
 END IF;
 prior_clock:=prior.updated_at;
 -- Prove both outer digest replay and a fresh digest with identical content:
 -- historical replay must not invoke the one-way void UPDATE a second time.
 IF public.ccp_teacher_backup_restore(batch,NULL,repeat('6',64)) IS DISTINCT FROM result
 OR public.ccp_teacher_backup_restore(batch,NULL,repeat('7',64)) IS DISTINCT FROM result
 OR (SELECT updated_at FROM public.material_teaching_evidence WHERE id=prior.id) IS DISTINCT FROM prior_clock THEN
  RAISE EXCEPTION 'MATERIAL_RESTORE_REPLAY_CHANGED_HISTORY';
 END IF;
 BEGIN
  PERFORM public.ccp_teacher_backup_restore(jsonb_build_object('material_teaching_evidence',
   jsonb_build_array(source||jsonb_build_object('learning_stage','practiced'))),NULL,repeat('8',64));
  RAISE EXCEPTION 'MATERIAL_RESTORE_ALLOWED_HISTORICAL_REWRITE';
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM<>'IMPORT_MATERIAL_EVIDENCE_MISMATCH' THEN RAISE;END IF;
 END;
 BEGIN
  PERFORM public.ccp_restore_canonical_chess_rows(jsonb_build_object('material_teaching_evidence',
   jsonb_build_array(source||jsonb_build_object(
    'id',new_id,'request_id',gen_random_uuid(),'stage_verified_by','00000000-0000-0000-0000-000000000002'))));
  RAISE EXCEPTION 'MATERIAL_RESTORE_ACCEPTED_FOREIGN_VERIFIER';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'IMPORT_FOREIGN_MATERIAL_EVIDENCE' THEN RAISE;END IF;
 END;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
 BEGIN
  PERFORM public.ccp_restore_canonical_chess_rows(jsonb_build_object('material_teaching_evidence',
   jsonb_build_array(source||jsonb_build_object(
    'teacher_id',auth.uid(),'stage_verified_by',auth.uid()))));
  RAISE EXCEPTION 'MATERIAL_RESTORE_ACCEPTED_ACTUAL_FOREIGN_ROW';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'IMPORT_FOREIGN_MATERIAL_EVIDENCE' THEN RAISE;END IF;
 END;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 BEGIN
  PERFORM public.ccp_teacher_backup_restore(jsonb_build_object('material_teaching_evidence',
   jsonb_build_array(source||jsonb_build_object('id',new_id,'request_id',gen_random_uuid()),
    archived_source)),NULL,repeat('9',64));
  RAISE EXCEPTION 'MATERIAL_RESTORE_ALLOWED_FRESH_ARCHIVED_PARENT';
 EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM<>'IMPORT_ARCHIVED_MATERIAL_EVIDENCE_REQUIRES_OPERATOR' THEN RAISE;END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.material_teaching_evidence WHERE id=new_id)
 OR EXISTS(SELECT 1 FROM public.teacher_backup_import_receipts
   WHERE teacher_id=auth.uid() AND digest=repeat('9',64)) THEN
  RAISE EXCEPTION 'MATERIAL_RESTORE_ARCHIVED_FAILURE_NOT_ATOMIC';
 END IF;
END
$material_restore$;
ROLLBACK;
