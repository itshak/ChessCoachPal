-- Reviewed forward-only contact-first student create transition.
-- Previously issued guardian portal tokens, existing invoices and replay
-- receipts remain unchanged. Operator must first verify restored data/approval.
BEGIN;
ALTER TABLE public.ccp_student_create_receipts
  ADD COLUMN IF NOT EXISTS created_contact_id uuid;
CREATE OR REPLACE FUNCTION public.ccp_student_create_full(
 p_name text,p_birthdate date,p_level text,p_teacher_notes text,
 p_guardian_id uuid,p_contact_email text,p_contact_phone text,
 p_contact_name text,p_adult_self boolean,p_archived boolean DEFAULT false,p_request_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp AS $$
DECLARE
 v_teacher uuid:=auth.uid();
 v_student public.students%ROWTYPE;
 v_guardian_id uuid:=p_guardian_id;
 v_created_family boolean:=false;
 v_created_contact_id uuid;
 v_name text:=btrim(p_name);
 v_email text:=nullif(btrim(p_contact_email),'');
 v_phone text:=nullif(btrim(p_contact_phone),'');
 v_contact text:=nullif(btrim(p_contact_name),'');
 v_hash text;
 v_previous public.ccp_student_create_receipts%ROWTYPE;
BEGIN
 IF v_teacher IS NULL THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
 END IF;
 IF v_name IS NULL OR length(v_name) NOT BETWEEN 1 AND 200
    OR length(coalesce(p_level,''))>120
    OR length(coalesce(p_teacher_notes,''))>50000
    OR length(coalesce(v_email,''))>254
    OR length(coalesce(v_phone,''))>50
    OR length(coalesce(v_contact,''))>160
    OR (coalesce(p_adult_self,false) AND length(v_name)>160
        AND v_contact IS NULL) THEN
   RAISE EXCEPTION 'STUDENT_INVALID_INPUT' USING ERRCODE='22023';
 END IF;
 IF p_request_id IS NOT NULL THEN
   v_hash:=md5(jsonb_build_object(
     'name',v_name,'birthdate',p_birthdate,'level',p_level,
     'notes',p_teacher_notes,'guardianId',p_guardian_id,
     'email',v_email,'phone',v_phone,'contactName',v_contact,
     'adultSelf',coalesce(p_adult_self,false),
     'archived',coalesce(p_archived,false))::text);
   PERFORM pg_advisory_xact_lock(hashtextextended(
     v_teacher::text||':full-student:'||p_request_id::text,0));
   SELECT * INTO v_previous FROM public.ccp_student_create_receipts
     WHERE teacher_id=v_teacher AND request_id=p_request_id;
   IF FOUND THEN
     IF v_previous.mutation_hash<>v_hash THEN
       RAISE EXCEPTION 'STUDENT_REQUEST_CONFLICT' USING ERRCODE='23505';
     END IF;
     SELECT * INTO v_student FROM public.students
       WHERE id=v_previous.student_id AND teacher_id=v_teacher;
     IF NOT FOUND THEN
       RAISE EXCEPTION 'STUDENT_ALREADY_DELETED' USING ERRCODE='23514';
     END IF;
     RETURN jsonb_build_object('student',to_jsonb(v_student),
       'createdFamily',v_previous.created_family,
       'createdContactId',v_previous.created_contact_id,'replayed',true);
   END IF;
 END IF;
 -- Existing portal-linked families remain explicitly selectable during the
 -- reviewed transition. New contact details NEVER create a portal grant.
 IF v_guardian_id IS NOT NULL THEN
   IF v_email IS NOT NULL OR v_phone IS NOT NULL OR v_contact IS NOT NULL
      OR coalesce(p_adult_self,false) THEN
     RAISE EXCEPTION 'CONTACT_AND_LEGACY_FAMILY_CONFLICT'
       USING ERRCODE='22023';
   END IF;
   PERFORM 1 FROM public.guardians
     WHERE id=v_guardian_id AND teacher_id=v_teacher;
   IF NOT FOUND THEN
     RAISE EXCEPTION 'GUARDIAN_NOT_FOUND' USING ERRCODE='42501';
   END IF;
 ELSIF v_email IS NOT NULL OR v_phone IS NOT NULL OR v_contact IS NOT NULL
      OR coalesce(p_adult_self,false) THEN
   IF NOT coalesce(p_adult_self,false) AND v_contact IS NULL THEN
     RAISE EXCEPTION 'CONTACT_NAME_REQUIRED' USING ERRCODE='22023';
   END IF;
   INSERT INTO public.contacts(
     teacher_id,display_name,kind,email,phone,status
   ) VALUES(
     v_teacher,coalesce(v_contact,v_name),'person',v_email,v_phone,'active'
   ) RETURNING id INTO v_created_contact_id;
 END IF;
 INSERT INTO public.students(
   teacher_id,name,guardian_id,birthdate,level,teacher_notes,archived_at
 ) VALUES(
   v_teacher,v_name,v_guardian_id,p_birthdate,
   nullif(btrim(p_level),''),coalesce(btrim(p_teacher_notes),''),
   CASE WHEN coalesce(p_archived,false) THEN clock_timestamp() ELSE NULL END
 ) RETURNING * INTO v_student;
 IF v_created_contact_id IS NOT NULL THEN
   INSERT INTO public.student_contacts(
     teacher_id,student_id,contact_id,relationship_label,
     is_legal_guardian,may_receive_messages
   ) VALUES(
     v_teacher,v_student.id,v_created_contact_id,
     CASE WHEN coalesce(p_adult_self,false) THEN 'Self'
          ELSE 'Unverified contact' END,
     false,false
   );
 END IF;
 IF p_request_id IS NOT NULL THEN
   INSERT INTO public.ccp_student_create_receipts(
     teacher_id,request_id,mutation_hash,student_id,created_family,created_contact_id
   ) VALUES(
     v_teacher,p_request_id,v_hash,v_student.id,v_created_family,v_created_contact_id
   );
 END IF;
 RETURN jsonb_build_object('student',to_jsonb(v_student),
   'createdFamily',v_created_family,
   'createdContactId',v_created_contact_id,'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_student_create_full(
 text,date,text,text,uuid,text,text,text,boolean,boolean,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_student_create_full(
 text,date,text,text,uuid,text,text,text,boolean,boolean,uuid) TO authenticated;
COMMIT;
