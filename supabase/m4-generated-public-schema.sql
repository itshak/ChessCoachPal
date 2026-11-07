


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."rsvp_status" AS ENUM (
    'pending',
    'yes',
    'no',
    'maybe'
);


ALTER TYPE "public"."rsvp_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_record_attendance"("p_session_id" "uuid", "p_student_id" "uuid", "p_status" "text", "p_note" "text", "p_expected_updated_at" timestamp with time zone, "p_idempotency_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_teacher uuid := auth.uid();
  v_hash text;
  v_saved public.agent_tool_receipts%ROWTYPE;
  v_updated public.session_attendance%ROWTYPE;
  v_receipt jsonb;
BEGIN
  IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_status NOT IN ('present','absent','late','excused') OR
      char_length(coalesce(p_note,'')) > 5000 OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR';
  END IF;
  v_hash := md5(jsonb_build_array(p_session_id,p_student_id,p_status,p_note,p_expected_updated_at)::text);
  INSERT INTO public.agent_tool_receipts(teacher_id,idempotency_key,operation,request_hash,receipt)
  VALUES(v_teacher,p_idempotency_key,'attendance.record',v_hash,'{}'::jsonb)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO v_saved FROM public.agent_tool_receipts
    WHERE teacher_id = v_teacher AND idempotency_key = p_idempotency_key;
    IF v_saved.operation <> 'attendance.record' OR v_saved.request_hash <> v_hash THEN
      RAISE EXCEPTION 'CONFLICT';
    END IF;
    RETURN v_saved.receipt;
  END IF;
  UPDATE public.session_attendance SET status = p_status, note = coalesce(p_note,''),
    updated_at = clock_timestamp()
  WHERE teacher_id = v_teacher AND session_id = p_session_id AND student_id = p_student_id
    AND updated_at = p_expected_updated_at
  RETURNING * INTO v_updated;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONFLICT_OR_NOT_FOUND'; END IF;
  v_receipt := jsonb_build_object('operation','attendance.record',
    'sessionId',p_session_id,'studentId',p_student_id,'status',p_status,
    'revision',v_updated.updated_at,'timestamp',now(),'idempotencyKey',p_idempotency_key);
  UPDATE public.agent_tool_receipts SET receipt = v_receipt
  WHERE teacher_id = v_teacher AND idempotency_key = p_idempotency_key;
  RETURN v_receipt;
END;
$$;


ALTER FUNCTION "public"."agent_record_attendance"("p_session_id" "uuid", "p_student_id" "uuid", "p_status" "text", "p_note" "text", "p_expected_updated_at" timestamp with time zone, "p_idempotency_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_update_session_note"("p_session_id" "uuid", "p_lesson_note" "text", "p_expected_updated_at" timestamp with time zone, "p_idempotency_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_teacher uuid := auth.uid();
  v_hash text;
  v_saved public.agent_tool_receipts%ROWTYPE;
  v_updated public.teaching_sessions%ROWTYPE;
  v_receipt jsonb;
BEGIN
  IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_lesson_note IS NULL OR char_length(p_lesson_note) > 10000
      OR p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  v_hash := md5(jsonb_build_array(p_session_id,p_lesson_note,p_expected_updated_at)::text);
  INSERT INTO public.agent_tool_receipts(teacher_id,idempotency_key,operation,request_hash,receipt)
  VALUES(v_teacher,p_idempotency_key,'sessions.note.update',v_hash,'{}'::jsonb)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO v_saved FROM public.agent_tool_receipts
    WHERE teacher_id = v_teacher AND idempotency_key = p_idempotency_key;
    IF v_saved.operation <> 'sessions.note.update' OR v_saved.request_hash <> v_hash THEN
      RAISE EXCEPTION 'CONFLICT';
    END IF;
    RETURN v_saved.receipt;
  END IF;
  UPDATE public.teaching_sessions SET lesson_note = p_lesson_note,
    updated_at = clock_timestamp()
  WHERE teacher_id = v_teacher AND id = p_session_id
    AND updated_at = p_expected_updated_at
  RETURNING * INTO v_updated;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONFLICT_OR_NOT_FOUND'; END IF;
  v_receipt := jsonb_build_object('operation','sessions.note.update',
    'sessionId',p_session_id,'revision',v_updated.updated_at,
    'timestamp',now(),'idempotencyKey',p_idempotency_key);
  UPDATE public.agent_tool_receipts SET receipt = v_receipt
  WHERE teacher_id = v_teacher AND idempotency_key = p_idempotency_key;
  RETURN v_receipt;
END;
$$;


ALTER FUNCTION "public"."agent_update_session_note"("p_session_id" "uuid", "p_lesson_note" "text", "p_expected_updated_at" timestamp with time zone, "p_idempotency_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chesscoachpal_seed_chess_skills"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.chess_skill_categories(teacher_id, name, sort_order) VALUES
    (NEW.id, 'Tactics', 10),
    (NEW.id, 'Calculation', 20),
    (NEW.id, 'Endgames', 30),
    (NEW.id, 'Strategy', 40),
    (NEW.id, 'Opening principles', 50),
    (NEW.id, 'Time management', 60);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."chesscoachpal_seed_chess_skills"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chesscoachpal_seed_workplace"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.workplaces(teacher_id, name, timezone, currency)
  VALUES (NEW.id, 'Private coaching', 'UTC', 'USD');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."chesscoachpal_seed_workplace"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chesscoachpal_snapshot_participants"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.student_id IS NOT NULL THEN
    INSERT INTO public.session_participants(teacher_id, session_id, student_id)
    VALUES (NEW.teacher_id, NEW.id, NEW.student_id);
  ELSE
    INSERT INTO public.session_participants(teacher_id, session_id, student_id)
    SELECT NEW.teacher_id, NEW.id, e.student_id
    FROM public.group_enrollments e
    WHERE e.teacher_id = NEW.teacher_id AND e.group_id = NEW.group_id;
  END IF;
  -- Create one and only one initially unmarked register row per snapshot member.
  INSERT INTO public.session_attendance(teacher_id, session_id, student_id, status)
  SELECT NEW.teacher_id, NEW.id, p.student_id, 'unmarked'
  FROM public.session_participants p
  WHERE p.teacher_id = NEW.teacher_id AND p.session_id = NEW.id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."chesscoachpal_snapshot_participants"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_credit_package_immutability"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF (NEW.id, NEW.teacher_id, NEW.student_id, NEW.invoice_id, NEW.credits,
      NEW.duration_minutes, NEW.price_cents, NEW.starts_on, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.teacher_id, OLD.student_id, OLD.invoice_id, OLD.credits,
      OLD.duration_minutes, OLD.price_cents, OLD.starts_on, OLD.created_at)
  THEN
    RAISE EXCEPTION 'Only a credit package''s expiry date can be changed';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_credit_package_immutability"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_credit_redemption_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  pkg     credit_packages%ROWTYPE;
  inv_status text;
  lsn     record;
  used    int;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW IS NOT DISTINCT FROM OLD THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Credit redemptions cannot be edited; remove and re-create instead';
  END IF;

  -- Lock the package so concurrent redemptions can't overspend it.
  SELECT * INTO pkg FROM credit_packages WHERE id = NEW.package_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit package % not found', NEW.package_id;
  END IF;

  -- Lock the lesson so an invoice line and a redemption can't race past
  -- each other's check.
  SELECT id, teacher_id, student_id, lesson_date, duration_minutes INTO lsn
    FROM lessons WHERE id = NEW.lesson_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lesson % not found', NEW.lesson_id;
  END IF;

  IF NEW.teacher_id <> pkg.teacher_id OR lsn.teacher_id <> pkg.teacher_id THEN
    RAISE EXCEPTION 'Credit package and lesson belong to different teachers';
  END IF;
  IF lsn.student_id <> pkg.student_id THEN
    RAISE EXCEPTION 'Credit package % is for a different student', pkg.id;
  END IF;
  IF lsn.duration_minutes <> pkg.duration_minutes THEN
    RAISE EXCEPTION 'Credit package % covers % min lessons, not % min',
      pkg.id, pkg.duration_minutes, lsn.duration_minutes;
  END IF;
  IF lsn.lesson_date < pkg.starts_on
     OR (pkg.expires_on IS NOT NULL AND lsn.lesson_date > pkg.expires_on) THEN
    RAISE EXCEPTION 'Lesson on % is outside credit package % dates', lsn.lesson_date, pkg.id;
  END IF;

  SELECT status INTO inv_status FROM invoices WHERE id = pkg.invoice_id;
  IF inv_status IS DISTINCT FROM 'sent' AND inv_status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'Credit package % can be used once its invoice is sent or paid', pkg.id;
  END IF;

  -- Excluding NEW.id lets a studio import re-upsert an existing row.
  SELECT count(*) INTO used FROM credit_redemptions
   WHERE package_id = pkg.id AND id <> NEW.id;
  IF used >= pkg.credits THEN
    RAISE EXCEPTION 'Credit package % has no credits left', pkg.id;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
     WHERE ii.lesson_id = NEW.lesson_id
       AND ii.kind = 'lesson'
       AND i.status <> 'void'
  ) THEN
    RAISE EXCEPTION 'Lesson % is already invoiced; it cannot also use a credit', NEW.lesson_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_credit_redemption_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_invoice_delete_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.status IN ('sent', 'paid') THEN
    RAISE EXCEPTION 'Invoice % is %; only draft or void invoices can be deleted', OLD.id, OLD.status;
  END IF;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."enforce_invoice_delete_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_invoice_immutability"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  paid_cents bigint;
BEGIN
  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  IF OLD.status <> 'draft' THEN
    IF NEW.teacher_id    IS DISTINCT FROM OLD.teacher_id
    OR NEW.guardian_id   IS DISTINCT FROM OLD.guardian_id
    OR NEW.period_start  IS DISTINCT FROM OLD.period_start
    OR NEW.period_end    IS DISTINCT FROM OLD.period_end
    OR NEW.subtotal_cents IS DISTINCT FROM OLD.subtotal_cents
    OR NEW.currency      IS DISTINCT FROM OLD.currency
    OR NEW.created_at    IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Invoice % is %; its commercial fields are frozen', OLD.id, OLD.status;
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'paid' AND NEW.status = 'sent' THEN
      SELECT COALESCE(SUM(amount_cents), 0) INTO paid_cents
        FROM payments WHERE invoice_id = OLD.id;
      IF paid_cents >= OLD.subtotal_cents THEN
        RAISE EXCEPTION 'Invoice % is fully paid; remove a payment before reopening it', OLD.id;
      END IF;
    ELSIF NOT (
      (OLD.status = 'draft')
      OR (OLD.status = 'sent' AND NEW.status IN ('paid', 'void'))
      OR (OLD.status = 'paid' AND NEW.status = 'void')
    ) THEN
      RAISE EXCEPTION 'Invalid invoice status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_invoice_immutability"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_invoice_item_freeze"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  parent_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  -- Deleting a lesson cascades ON DELETE SET NULL onto invoice_items.
  -- That reference cleanup is fine on frozen invoices as long as nothing
  -- else about the line changes.
  IF TG_OP = 'UPDATE'
    AND OLD.lesson_id IS NOT NULL
    AND NEW.lesson_id IS NULL
    AND (NEW.invoice_id, NEW.description, NEW.quantity, NEW.unit_cents, NEW.amount_cents, NEW.sort_order)
        IS NOT DISTINCT FROM
        (OLD.invoice_id, OLD.description, OLD.quantity, OLD.unit_cents, OLD.amount_cents, OLD.sort_order)
  THEN
    RETURN NEW;
  END IF;

  SELECT status INTO parent_status FROM invoices WHERE id = OLD.invoice_id;

  IF parent_status IN ('sent', 'paid') THEN
    RAISE EXCEPTION 'Invoice % is %; its line items are frozen', OLD.invoice_id, parent_status;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_invoice_item_freeze"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_invoice_item_not_redeemed"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.lesson_id IS NULL OR NEW.kind <> 'lesson' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.lesson_id IS NOT DISTINCT FROM OLD.lesson_id
     AND NEW.kind IS NOT DISTINCT FROM OLD.kind THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM lessons WHERE id = NEW.lesson_id FOR NO KEY UPDATE;

  IF EXISTS (SELECT 1 FROM credit_redemptions WHERE lesson_id = NEW.lesson_id) THEN
    RAISE EXCEPTION 'Lesson % was paid with a prepaid credit; it cannot also be invoiced', NEW.lesson_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_invoice_item_not_redeemed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_package_invoice_void"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = 'void' AND OLD.status <> 'void' AND EXISTS (
    SELECT 1
      FROM credit_packages p
      JOIN credit_redemptions r ON r.package_id = p.id
     WHERE p.invoice_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Invoice % sold prepaid credits that are already used; return them before voiding', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_package_invoice_void"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_payment_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  parent_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  SELECT status INTO parent_status FROM invoices WHERE id = OLD.invoice_id;

  -- Parent already deleted: this is the ON DELETE CASCADE cleanup.
  IF parent_status IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.method = 'stripe' THEN
    RAISE EXCEPTION 'Stripe payments cannot be changed or removed; refund in Stripe instead';
  END IF;

  IF parent_status = 'void' THEN
    RAISE EXCEPTION 'Invoice % is void; its payments are frozen', OLD.invoice_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF (NEW.invoice_id, NEW.amount_cents, NEW.method, NEW.external_id, NEW.recorded_at)
     IS DISTINCT FROM
     (OLD.invoice_id, OLD.amount_cents, OLD.method, OLD.external_id, OLD.recorded_at)
  THEN
    RAISE EXCEPTION 'Only a payment''s note can be edited; remove and re-record it instead';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_payment_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reopen_underpaid_invoice"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  paid_cents bigint;
BEGIN
  SELECT COALESCE(SUM(amount_cents), 0) INTO paid_cents
    FROM payments WHERE invoice_id = OLD.invoice_id;

  UPDATE invoices
     SET status = 'sent', paid_at = NULL, payment_method = NULL
   WHERE id = OLD.invoice_id
     AND status = 'paid'
     AND paid_cents < subtotal_cents;

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."reopen_underpaid_invoice"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agent_oauth_clients" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "redirect_uris" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_oauth_clients_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 100))),
    CONSTRAINT "agent_oauth_clients_redirect_uris_check" CHECK (("jsonb_typeof"("redirect_uris") = 'array'::"text"))
);


ALTER TABLE "public"."agent_oauth_clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_oauth_codes" (
    "code_hash" "text" NOT NULL,
    "client_id" "text" NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "redirect_uri" "text" NOT NULL,
    "resource" "text" NOT NULL,
    "scopes" "text" NOT NULL,
    "challenge" "text" NOT NULL,
    "encrypted_session" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone
);


ALTER TABLE "public"."agent_oauth_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_oauth_grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "text" NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "resource" "text" NOT NULL,
    "scopes" "text" NOT NULL,
    "access_hash" "text" NOT NULL,
    "refresh_hash" "text" NOT NULL,
    "access_expires_at" timestamp with time zone NOT NULL,
    "refresh_expires_at" timestamp with time zone NOT NULL,
    "encrypted_session" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone
);


ALTER TABLE "public"."agent_oauth_grants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_tool_receipts" (
    "teacher_id" "uuid" NOT NULL,
    "idempotency_key" "uuid" NOT NULL,
    "operation" "text" NOT NULL,
    "request_hash" "text" NOT NULL,
    "receipt" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agent_tool_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lesson_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "notice_at" timestamp with time zone,
    "marked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cancel_note" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "attendance_status_check" CHECK (("status" = ANY (ARRAY['attended'::"text", 'teacher_cancel'::"text", 'student_cancel'::"text", 'no_show'::"text"])))
);


ALTER TABLE "public"."attendance" OWNER TO "postgres";


COMMENT ON COLUMN "public"."attendance"."cancel_note" IS 'Optional note from family (portal) or teacher when marking student_cancel.';



CREATE TABLE IF NOT EXISTS "public"."chess_learning_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "student_id" "uuid",
    "session_id" "uuid",
    "label" "text" NOT NULL,
    "url" "text" NOT NULL,
    "resource_type" "text" NOT NULL,
    "provider_study_id" "text",
    "provider_chapter_id" "text",
    "request_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chess_learning_resources_check" CHECK ((("student_id" IS NOT NULL) OR ("session_id" IS NOT NULL))),
    CONSTRAINT "chess_learning_resources_check1" CHECK (((("resource_type" = 'lichess_study'::"text") AND ("provider_study_id" IS NOT NULL) AND ("provider_study_id" ~ '^[a-zA-Z0-9]{8}$'::"text") AND (("provider_chapter_id" IS NULL) OR ("provider_chapter_id" ~ '^[a-zA-Z0-9]{8}$'::"text"))) OR (("resource_type" = 'external'::"text") AND ("provider_study_id" IS NULL) AND ("provider_chapter_id" IS NULL)))),
    CONSTRAINT "chess_learning_resources_label_check" CHECK ((("char_length"("btrim"("label")) >= 1) AND ("char_length"("btrim"("label")) <= 160))),
    CONSTRAINT "chess_learning_resources_resource_type_check" CHECK (("resource_type" = ANY (ARRAY['lichess_study'::"text", 'external'::"text"]))),
    CONSTRAINT "chess_learning_resources_url_check" CHECK (((("char_length"("url") >= 9) AND ("char_length"("url") <= 2048)) AND ("url" ~ '^https://'::"text")))
);


ALTER TABLE "public"."chess_learning_resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chess_observations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "category_id" "uuid" NOT NULL,
    "observation" "text" NOT NULL,
    "observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" NOT NULL,
    "verified_at" timestamp with time zone,
    "verified_by" "uuid",
    "request_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chess_observations_check" CHECK ((("verified_by" IS NULL) OR ("verified_by" = "teacher_id"))),
    CONSTRAINT "chess_observations_check1" CHECK ((("verified_at" IS NULL) = ("verified_by" IS NULL))),
    CONSTRAINT "chess_observations_check2" CHECK ((("source" <> 'teacher'::"text") OR ("verified_at" IS NOT NULL))),
    CONSTRAINT "chess_observations_observation_check" CHECK ((("char_length"("btrim"("observation")) >= 1) AND ("char_length"("btrim"("observation")) <= 5000))),
    CONSTRAINT "chess_observations_source_check" CHECK (("source" = ANY (ARRAY['teacher'::"text", 'agent'::"text"])))
);


ALTER TABLE "public"."chess_observations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chess_skill_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chess_skill_categories_description_check" CHECK (("char_length"("description") <= 500)),
    CONSTRAINT "chess_skill_categories_name_check" CHECK ((("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 80))),
    CONSTRAINT "chess_skill_categories_sort_order_check" CHECK ((("sort_order" >= 0) AND ("sort_order" <= 10000)))
);


ALTER TABLE "public"."chess_skill_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "workplace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "class_groups_name_check" CHECK ((("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 120)))
);


ALTER TABLE "public"."class_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_packages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "credits" integer NOT NULL,
    "duration_minutes" integer NOT NULL,
    "price_cents" integer NOT NULL,
    "starts_on" "date" NOT NULL,
    "expires_on" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "credit_packages_check" CHECK ((("expires_on" IS NULL) OR ("expires_on" >= "starts_on"))),
    CONSTRAINT "credit_packages_credits_check" CHECK (("credits" > 0)),
    CONSTRAINT "credit_packages_duration_minutes_check" CHECK (("duration_minutes" > 0)),
    CONSTRAINT "credit_packages_price_cents_check" CHECK (("price_cents" >= 0))
);


ALTER TABLE "public"."credit_packages" OWNER TO "postgres";


COMMENT ON TABLE "public"."credit_packages" IS 'Prepaid lesson credits for one student and lesson length; sold through invoice_id.';



CREATE TABLE IF NOT EXISTS "public"."credit_redemptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "package_id" "uuid" NOT NULL,
    "lesson_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."credit_redemptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."credit_redemptions" IS 'Ledger: lesson_id was paid by one credit of package_id instead of being invoiced.';



CREATE TABLE IF NOT EXISTS "public"."event_rsvps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "guardian_id" "uuid" NOT NULL,
    "status" "public"."rsvp_status" DEFAULT 'pending'::"public"."rsvp_status" NOT NULL,
    "party_size" integer,
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "responded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_rsvps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_students" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "repertoire" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."event_students" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "location" "text" DEFAULT ''::"text" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "send_reminder" boolean DEFAULT false NOT NULL,
    "reminder_sent_at" timestamp with time zone
);


ALTER TABLE "public"."events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."events"."send_reminder" IS 'When true, cron emails invited families on the studio-local day before starts_at.';



COMMENT ON COLUMN "public"."events"."reminder_sent_at" IS 'Set when the day-before reminder batch was attempted (dedupe).';



CREATE TABLE IF NOT EXISTS "public"."group_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "workplace_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."group_enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guardians" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "portal_token" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "secondary_name" "text",
    "secondary_email" "text",
    "secondary_phone" "text",
    "email_recipients" "text" DEFAULT 'primary'::"text" NOT NULL,
    "family_name" "text",
    CONSTRAINT "guardians_email_recipients_check" CHECK (("email_recipients" = ANY (ARRAY['primary'::"text", 'secondary'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."guardians" OWNER TO "postgres";


COMMENT ON COLUMN "public"."guardians"."email_recipients" IS 'Which guardian(s) receive family emails: primary, secondary, or both.';



CREATE TABLE IF NOT EXISTS "public"."invoice_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "lesson_id" "uuid",
    "description" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_cents" integer NOT NULL,
    "amount_cents" integer NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "kind" "text" DEFAULT 'lesson'::"text" NOT NULL,
    CONSTRAINT "invoice_items_amount_cents_check" CHECK (("amount_cents" >= 0)),
    CONSTRAINT "invoice_items_kind_check" CHECK (("kind" = ANY (ARRAY['lesson'::"text", 'travel'::"text", 'credit_package'::"text"]))),
    CONSTRAINT "invoice_items_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "invoice_items_unit_cents_check" CHECK (("unit_cents" >= 0))
);


ALTER TABLE "public"."invoice_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."invoice_items"."kind" IS 'lesson = a lesson charge; travel = home-visit travel fee; credit_package = prepaid credits sale.';



CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "guardian_id" "uuid" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "subtotal_cents" integer DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "payment_method" "text",
    "stripe_checkout_session_id" "text",
    "stripe_payment_intent_id" "text",
    "stripe_checkout_url" "text",
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invoices_check" CHECK (("period_end" >= "period_start")),
    CONSTRAINT "invoices_payment_method_check" CHECK ((("payment_method" IS NULL) OR ("payment_method" = ANY (ARRAY['manual'::"text", 'stripe'::"text"])))),
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sent'::"text", 'paid'::"text", 'void'::"text"]))),
    CONSTRAINT "invoices_subtotal_cents_check" CHECK (("subtotal_cents" >= 0))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lesson_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lesson_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "shared_with_parent" boolean DEFAULT false NOT NULL,
    "emailed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "private_body" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."lesson_notes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."lesson_notes"."body" IS 'Notes shared with the family (portal + email when sent).';



COMMENT ON COLUMN "public"."lesson_notes"."private_body" IS 'Teacher-only notes for this lesson; never shown on the family portal.';



CREATE TABLE IF NOT EXISTS "public"."lesson_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "day_of_week" integer NOT NULL,
    "start_time" time without time zone NOT NULL,
    "duration_minutes" integer DEFAULT 30 NOT NULL,
    "start_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "end_date" "date",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rate_cents" integer,
    "is_home_visit" boolean DEFAULT false NOT NULL,
    CONSTRAINT "lesson_slots_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6))),
    CONSTRAINT "lesson_slots_duration_minutes_check" CHECK (("duration_minutes" > 0)),
    CONSTRAINT "lesson_slots_rate_cents_check" CHECK ((("rate_cents" IS NULL) OR ("rate_cents" >= 0)))
);


ALTER TABLE "public"."lesson_slots" OWNER TO "postgres";


COMMENT ON COLUMN "public"."lesson_slots"."rate_cents" IS 'Per-slot lesson rate in cents; falls back to student then studio default.';



COMMENT ON COLUMN "public"."lesson_slots"."is_home_visit" IS 'When true, materialized lessons inherit home-visit status for travel fees.';



CREATE TABLE IF NOT EXISTS "public"."lessons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "slot_id" "uuid",
    "lesson_date" "date" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "duration_minutes" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "makeup_for" "uuid",
    "is_home_visit" boolean DEFAULT false NOT NULL,
    "rescheduled_from_date" "date",
    CONSTRAINT "lessons_duration_minutes_check" CHECK (("duration_minutes" > 0))
);


ALTER TABLE "public"."lessons" OWNER TO "postgres";


COMMENT ON COLUMN "public"."lessons"."is_home_visit" IS 'Home visit flag for travel fee billing (copied from slot or set on one-offs).';



COMMENT ON COLUMN "public"."lessons"."rescheduled_from_date" IS 'Original slot occurrence date this lesson was moved away from; NULL when never moved. materializeLessons skips the (slot_id, rescheduled_from_date) pair so the vacated occurrence is not re-created.';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "href" "text",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['portal_cancel'::"text", 'invoice_paid'::"text", 'event_rsvp'::"text", 'welcome'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "method" "text" NOT NULL,
    "external_id" "text",
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "payments_amount_cents_check" CHECK (("amount_cents" >= 0)),
    CONSTRAINT "payments_method_check" CHECK (("method" = ANY (ARRAY['manual'::"text", 'stripe'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."push_subscriptions" IS 'Web Push subscriptions for teacher notifications; one row per device.';



CREATE TABLE IF NOT EXISTS "public"."session_attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'unmarked'::"text" NOT NULL,
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "session_attendance_note_check" CHECK (("char_length"("note") <= 5000)),
    CONSTRAINT "session_attendance_status_check" CHECK (("status" = ANY (ARRAY['unmarked'::"text", 'present'::"text", 'absent'::"text", 'late'::"text", 'excused'::"text"])))
);


ALTER TABLE "public"."session_attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_participants" (
    "teacher_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL
);


ALTER TABLE "public"."session_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."skill_assessments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dimension_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "note" "text",
    "assessed_on" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "skill_assessments_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."skill_assessments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."skill_dimensions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."skill_dimensions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."students" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "parent_contact" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "teacher_notes" "text" DEFAULT ''::"text" NOT NULL,
    "guardian_id" "uuid",
    "level" "text",
    "birthdate" "date",
    "default_rate_cents" integer,
    "practice_start_date" "date",
    "archived_at" timestamp with time zone,
    "travel_fee_cents" integer,
    CONSTRAINT "students_default_rate_cents_check" CHECK ((("default_rate_cents" IS NULL) OR ("default_rate_cents" >= 0))),
    CONSTRAINT "students_travel_fee_cents_check" CHECK ((("travel_fee_cents" IS NULL) OR ("travel_fee_cents" >= 0)))
);


ALTER TABLE "public"."students" OWNER TO "postgres";


COMMENT ON COLUMN "public"."students"."parent_contact" IS 'DEPRECATED: legacy freeform contact, superseded by guardian_id. Kept for reference until fully migrated.';



COMMENT ON COLUMN "public"."students"."guardian_id" IS 'v1: single guardian per student, on purpose. Split households need a student_guardians join table (known v2 item).';



COMMENT ON COLUMN "public"."students"."level" IS 'Optional human-set level anchor, e.g. "RCM Level 3" or "Faber 2B" (§4).';



COMMENT ON COLUMN "public"."students"."birthdate" IS 'Optional; used to show the student''s age alongside their level anchor.';



COMMENT ON COLUMN "public"."students"."default_rate_cents" IS 'Per-student default lesson rate in cents; overridden by slot.rate_cents.';



COMMENT ON COLUMN "public"."students"."practice_start_date" IS 'Optional start of practice with this studio. Year-only is stored as YYYY-01-01.';



COMMENT ON COLUMN "public"."students"."archived_at" IS 'When set, student is archived and does not count toward hosted free-tier active student caps.';



COMMENT ON COLUMN "public"."students"."travel_fee_cents" IS 'Per-student travel fee override in cents; falls back to studio travel_fee_cents.';



CREATE TABLE IF NOT EXISTS "public"."studio_policies" (
    "teacher_id" "uuid" NOT NULL,
    "timezone" "text" DEFAULT 'America/Chicago'::"text" NOT NULL,
    "cancellation_window_hours" integer DEFAULT 24 NOT NULL,
    "timely_cancel_earns_makeup" boolean DEFAULT true NOT NULL,
    "late_cancel_earns_makeup" boolean DEFAULT false NOT NULL,
    "no_show_earns_makeup" boolean DEFAULT false NOT NULL,
    "teacher_cancel_earns_makeup" boolean DEFAULT true NOT NULL,
    "makeup_credit_expiry_days" integer,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "studio_name" "text" DEFAULT ''::"text" NOT NULL,
    "lesson_duration_options" integer[] DEFAULT '{30,45,60}'::integer[] NOT NULL,
    "studio_website" "text" DEFAULT ''::"text" NOT NULL,
    "studio_contact" "text" DEFAULT ''::"text" NOT NULL,
    "studio_info" "text" DEFAULT ''::"text" NOT NULL,
    "bill_attended" boolean DEFAULT true NOT NULL,
    "bill_no_show" boolean DEFAULT true NOT NULL,
    "bill_teacher_cancel" boolean DEFAULT false NOT NULL,
    "bill_timely_student_cancel" boolean DEFAULT false NOT NULL,
    "bill_late_student_cancel" boolean DEFAULT true NOT NULL,
    "bill_makeup" boolean DEFAULT false NOT NULL,
    "default_rate_cents" integer,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "invoice_cadence" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "payment_instructions" "text" DEFAULT ''::"text" NOT NULL,
    "payment_provider" "text" DEFAULT 'manual'::"text" NOT NULL,
    "stripe_secret_key" "text",
    "stripe_publishable_key" "text",
    "stripe_webhook_secret" "text",
    "rate_basis" "text" DEFAULT 'per_hour'::"text" NOT NULL,
    "notify_in_app" boolean DEFAULT true NOT NULL,
    "notify_email_portal_cancel" boolean DEFAULT true NOT NULL,
    "notify_email_invoice_paid" boolean DEFAULT true NOT NULL,
    "ai_provider" "text" DEFAULT 'none'::"text" NOT NULL,
    "ai_api_key" "text",
    "policies_updated_at" timestamp with time zone,
    "duration_rate_cents" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "travel_fee_cents" integer,
    "payment_qr_code" "text",
    "bcc_family_emails" boolean DEFAULT false NOT NULL,
    "bcc_email" "text",
    "lesson_label" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "studio_policies_ai_provider_check" CHECK (("ai_provider" = ANY (ARRAY['none'::"text", 'openai'::"text", 'anthropic'::"text"]))),
    CONSTRAINT "studio_policies_bcc_email_check" CHECK ((("bcc_email" IS NULL) OR (("length"("bcc_email") <= 320) AND ("bcc_email" ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}$'::"text")))),
    CONSTRAINT "studio_policies_cancellation_window_hours_check" CHECK (("cancellation_window_hours" >= 0)),
    CONSTRAINT "studio_policies_default_rate_cents_check" CHECK ((("default_rate_cents" IS NULL) OR ("default_rate_cents" >= 0))),
    CONSTRAINT "studio_policies_invoice_cadence_check" CHECK (("invoice_cadence" = ANY (ARRAY['monthly'::"text", 'manual'::"text"]))),
    CONSTRAINT "studio_policies_makeup_credit_expiry_days_check" CHECK (("makeup_credit_expiry_days" > 0)),
    CONSTRAINT "studio_policies_payment_provider_check" CHECK (("payment_provider" = ANY (ARRAY['manual'::"text", 'stripe'::"text"]))),
    CONSTRAINT "studio_policies_payment_qr_code_check" CHECK ((("payment_qr_code" IS NULL) OR (("length"("payment_qr_code") <= 400000) AND ("payment_qr_code" ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/]+=*$'::"text")))),
    CONSTRAINT "studio_policies_rate_basis_check" CHECK (("rate_basis" = ANY (ARRAY['per_lesson'::"text", 'per_hour'::"text"]))),
    CONSTRAINT "studio_policies_travel_fee_cents_check" CHECK ((("travel_fee_cents" IS NULL) OR ("travel_fee_cents" >= 0)))
);


ALTER TABLE "public"."studio_policies" OWNER TO "postgres";


COMMENT ON COLUMN "public"."studio_policies"."lesson_duration_options" IS 'Template time blocks (minutes) offered when creating slots and one-off lessons.';



COMMENT ON COLUMN "public"."studio_policies"."studio_info" IS 'Human-readable studio policies/info shown on the family portal (free text).';



COMMENT ON COLUMN "public"."studio_policies"."bill_attended" IS 'Whether attended lessons appear on invoices.';



COMMENT ON COLUMN "public"."studio_policies"."default_rate_cents" IS 'Studio-wide fallback rate in cents. Slot rate → student default → this.';



COMMENT ON COLUMN "public"."studio_policies"."payment_provider" IS 'manual = mark-as-paid + payment_instructions; stripe = BYO Checkout links.';



COMMENT ON COLUMN "public"."studio_policies"."rate_basis" IS 'per_lesson = configured rate is the full lesson charge; per_hour = rate × (minutes/60).';



COMMENT ON COLUMN "public"."studio_policies"."notify_in_app" IS 'Show events in the teacher in-app notification bell.';



COMMENT ON COLUMN "public"."studio_policies"."notify_email_portal_cancel" IS 'Email the teacher when a family cancels via the portal.';



COMMENT ON COLUMN "public"."studio_policies"."notify_email_invoice_paid" IS 'Email the teacher when a Stripe invoice is paid online.';



COMMENT ON COLUMN "public"."studio_policies"."ai_provider" IS 'Optional BYO LLM for assist features (import mapping, future drafts). none = off.';



COMMENT ON COLUMN "public"."studio_policies"."ai_api_key" IS 'Teacher-provided API key for ai_provider. Never logged; masked in API responses.';



COMMENT ON COLUMN "public"."studio_policies"."duration_rate_cents" IS 'Optional map of duration minutes (as text keys) to flat lesson charge in cents.';



COMMENT ON COLUMN "public"."studio_policies"."travel_fee_cents" IS 'Studio-wide flat travel fee in cents for home visits; overridden by student.travel_fee_cents.';



COMMENT ON COLUMN "public"."studio_policies"."payment_qr_code" IS 'Optional payment QR image as a data:image/(png|jpeg);base64 URL; shown with manual payment instructions.';



COMMENT ON COLUMN "public"."studio_policies"."bcc_family_emails" IS 'BCC the teacher''s own address on family-facing email when true.';



COMMENT ON COLUMN "public"."studio_policies"."bcc_email" IS 'Address to BCC on family email when bcc_family_emails is true; defaults to the account email in the UI.';



COMMENT ON COLUMN "public"."studio_policies"."lesson_label" IS 'Subject/instrument used in calendar feed titles (e.g. "Piano" -> "Piano lesson — Ann"). Empty = neutral "Lesson".';



CREATE TABLE IF NOT EXISTS "public"."teachers" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "display_name" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hosted_plan" "text" DEFAULT 'free'::"text" NOT NULL,
    "trial_ends_at" timestamp with time zone,
    "gifted_until" timestamp with time zone,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "founding_number" integer,
    "stripe_cancel_at" timestamp with time zone,
    "avatar_url" "text",
    "onboarding_tour_completed_at" timestamp with time zone,
    "calendar_token" "text" DEFAULT "rtrim"("translate"("encode"("extensions"."gen_random_bytes"(16), 'base64'::"text"), '+/'::"text", '-_'::"text"), '='::"text") NOT NULL,
    CONSTRAINT "teachers_hosted_plan_check" CHECK (("hosted_plan" = ANY (ARRAY['free'::"text", 'trial'::"text", 'pro'::"text", 'founding'::"text", 'gifted'::"text"])))
);


ALTER TABLE "public"."teachers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."teachers"."hosted_plan" IS 'Hosted CogNote plan (free/trial/pro/founding/gifted). Ignored when COGNOTE_DEPLOYMENT=self_hosted.';



COMMENT ON COLUMN "public"."teachers"."stripe_customer_id" IS 'Platform Stripe customer for CogNote hosted subscription — not teacher BYO lesson Stripe.';



COMMENT ON COLUMN "public"."teachers"."stripe_subscription_id" IS 'Platform Stripe subscription id for CogNote Hosted Pro.';



COMMENT ON COLUMN "public"."teachers"."stripe_cancel_at" IS 'When set, Hosted Pro cancels at this time (from Stripe cancel_at). Cleared when subscription is active without pending cancel.';



COMMENT ON COLUMN "public"."teachers"."avatar_url" IS 'Public URL for the teacher profile photo (Storage avatars bucket).';



COMMENT ON COLUMN "public"."teachers"."onboarding_tour_completed_at" IS 'Set when the teacher finishes or skips the first-run tour. NULL means show the tour.';



COMMENT ON COLUMN "public"."teachers"."calendar_token" IS 'Revocable token for the read-only teacher .ics feed. Rotate to revoke the old URL.';



CREATE TABLE IF NOT EXISTS "public"."teaching_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "workplace_id" "uuid" NOT NULL,
    "group_id" "uuid",
    "student_id" "uuid",
    "title" "text" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "duration_minutes" integer NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lesson_note" "text" DEFAULT ''::"text" NOT NULL,
    "request_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "teaching_sessions_check" CHECK ((("group_id" IS NULL) <> ("student_id" IS NULL))),
    CONSTRAINT "teaching_sessions_duration_minutes_check" CHECK ((("duration_minutes" >= 15) AND ("duration_minutes" <= 480))),
    CONSTRAINT "teaching_sessions_lesson_note_check" CHECK (("char_length"("lesson_note") <= 10000)),
    CONSTRAINT "teaching_sessions_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "teaching_sessions_title_check" CHECK ((("char_length"("btrim"("title")) >= 1) AND ("char_length"("btrim"("title")) <= 160)))
);


ALTER TABLE "public"."teaching_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waitlist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."waitlist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workplace_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "workplace_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workplace_enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workplaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "timezone" "text" DEFAULT 'UTC'::"text" NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "locale" "text" DEFAULT 'en'::"text" NOT NULL,
    "policy" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workplaces_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "workplaces_locale_check" CHECK (("locale" ~ '^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$'::"text")),
    CONSTRAINT "workplaces_name_check" CHECK (((("char_length"("btrim"("name")) >= 0) AND ("char_length"("btrim"("name")) <= 120)) AND ("char_length"("btrim"("name")) > 0))),
    CONSTRAINT "workplaces_policy_check" CHECK (("jsonb_typeof"("policy") = 'object'::"text")),
    CONSTRAINT "workplaces_timezone_check" CHECK ((("char_length"("timezone") >= 1) AND ("char_length"("timezone") <= 80)))
);


ALTER TABLE "public"."workplaces" OWNER TO "postgres";


ALTER TABLE ONLY "public"."agent_oauth_clients"
    ADD CONSTRAINT "agent_oauth_clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_oauth_codes"
    ADD CONSTRAINT "agent_oauth_codes_pkey" PRIMARY KEY ("code_hash");



ALTER TABLE ONLY "public"."agent_oauth_grants"
    ADD CONSTRAINT "agent_oauth_grants_access_hash_key" UNIQUE ("access_hash");



ALTER TABLE ONLY "public"."agent_oauth_grants"
    ADD CONSTRAINT "agent_oauth_grants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_oauth_grants"
    ADD CONSTRAINT "agent_oauth_grants_refresh_hash_key" UNIQUE ("refresh_hash");



ALTER TABLE ONLY "public"."agent_tool_receipts"
    ADD CONSTRAINT "agent_tool_receipts_pkey" PRIMARY KEY ("teacher_id", "idempotency_key");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_lesson_id_key" UNIQUE ("lesson_id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chess_learning_resources"
    ADD CONSTRAINT "chess_learning_resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chess_learning_resources"
    ADD CONSTRAINT "chess_learning_resources_teacher_id_request_id_key" UNIQUE ("teacher_id", "request_id");



ALTER TABLE ONLY "public"."chess_observations"
    ADD CONSTRAINT "chess_observations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chess_observations"
    ADD CONSTRAINT "chess_observations_teacher_id_request_id_key" UNIQUE ("teacher_id", "request_id");



ALTER TABLE ONLY "public"."chess_skill_categories"
    ADD CONSTRAINT "chess_skill_categories_id_teacher_id_key" UNIQUE ("id", "teacher_id");



ALTER TABLE ONLY "public"."chess_skill_categories"
    ADD CONSTRAINT "chess_skill_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chess_skill_categories"
    ADD CONSTRAINT "chess_skill_categories_teacher_id_name_key" UNIQUE ("teacher_id", "name");



ALTER TABLE ONLY "public"."class_groups"
    ADD CONSTRAINT "class_groups_id_teacher_id_key" UNIQUE ("id", "teacher_id");



ALTER TABLE ONLY "public"."class_groups"
    ADD CONSTRAINT "class_groups_id_teacher_id_workplace_id_key" UNIQUE ("id", "teacher_id", "workplace_id");



ALTER TABLE ONLY "public"."class_groups"
    ADD CONSTRAINT "class_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_groups"
    ADD CONSTRAINT "class_groups_teacher_id_workplace_id_name_key" UNIQUE ("teacher_id", "workplace_id", "name");



ALTER TABLE ONLY "public"."credit_packages"
    ADD CONSTRAINT "credit_packages_invoice_id_key" UNIQUE ("invoice_id");



ALTER TABLE ONLY "public"."credit_packages"
    ADD CONSTRAINT "credit_packages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_redemptions"
    ADD CONSTRAINT "credit_redemptions_lesson_id_key" UNIQUE ("lesson_id");



ALTER TABLE ONLY "public"."credit_redemptions"
    ADD CONSTRAINT "credit_redemptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_rsvps"
    ADD CONSTRAINT "event_rsvps_event_id_guardian_id_key" UNIQUE ("event_id", "guardian_id");



ALTER TABLE ONLY "public"."event_rsvps"
    ADD CONSTRAINT "event_rsvps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_students"
    ADD CONSTRAINT "event_students_event_id_student_id_key" UNIQUE ("event_id", "student_id");



ALTER TABLE ONLY "public"."event_students"
    ADD CONSTRAINT "event_students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_enrollments"
    ADD CONSTRAINT "group_enrollments_group_id_student_id_key" UNIQUE ("group_id", "student_id");



ALTER TABLE ONLY "public"."group_enrollments"
    ADD CONSTRAINT "group_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guardians"
    ADD CONSTRAINT "guardians_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guardians"
    ADD CONSTRAINT "guardians_portal_token_key" UNIQUE ("portal_token");



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_notes"
    ADD CONSTRAINT "lesson_notes_lesson_id_key" UNIQUE ("lesson_id");



ALTER TABLE ONLY "public"."lesson_notes"
    ADD CONSTRAINT "lesson_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_slots"
    ADD CONSTRAINT "lesson_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_makeup_for_key" UNIQUE ("makeup_for");



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_slot_id_lesson_date_key" UNIQUE ("slot_id", "lesson_date");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_attendance"
    ADD CONSTRAINT "session_attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_attendance"
    ADD CONSTRAINT "session_attendance_session_id_student_id_key" UNIQUE ("session_id", "student_id");



ALTER TABLE ONLY "public"."session_participants"
    ADD CONSTRAINT "session_participants_pkey" PRIMARY KEY ("session_id", "student_id");



ALTER TABLE ONLY "public"."skill_assessments"
    ADD CONSTRAINT "skill_assessments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."skill_dimensions"
    ADD CONSTRAINT "skill_dimensions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."skill_dimensions"
    ADD CONSTRAINT "skill_dimensions_teacher_id_name_key" UNIQUE ("teacher_id", "name");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_id_teacher_id_key" UNIQUE ("id", "teacher_id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."studio_policies"
    ADD CONSTRAINT "studio_policies_pkey" PRIMARY KEY ("teacher_id");



ALTER TABLE ONLY "public"."teachers"
    ADD CONSTRAINT "teachers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teaching_sessions"
    ADD CONSTRAINT "teaching_sessions_id_teacher_id_key" UNIQUE ("id", "teacher_id");



ALTER TABLE ONLY "public"."teaching_sessions"
    ADD CONSTRAINT "teaching_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teaching_sessions"
    ADD CONSTRAINT "teaching_sessions_teacher_id_request_id_key" UNIQUE ("teacher_id", "request_id");



ALTER TABLE ONLY "public"."waitlist"
    ADD CONSTRAINT "waitlist_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."waitlist"
    ADD CONSTRAINT "waitlist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workplace_enrollments"
    ADD CONSTRAINT "workplace_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workplace_enrollments"
    ADD CONSTRAINT "workplace_enrollments_teacher_id_workplace_id_student_id_key" UNIQUE ("teacher_id", "workplace_id", "student_id");



ALTER TABLE ONLY "public"."workplaces"
    ADD CONSTRAINT "workplaces_id_teacher_id_key" UNIQUE ("id", "teacher_id");



ALTER TABLE ONLY "public"."workplaces"
    ADD CONSTRAINT "workplaces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workplaces"
    ADD CONSTRAINT "workplaces_teacher_id_name_key" UNIQUE ("teacher_id", "name");



CREATE INDEX "agent_codes_expiry_idx" ON "public"."agent_oauth_codes" USING "btree" ("expires_at");



CREATE INDEX "agent_grants_teacher_idx" ON "public"."agent_oauth_grants" USING "btree" ("teacher_id", "revoked_at");



CREATE INDEX "agent_receipts_created_idx" ON "public"."agent_tool_receipts" USING "btree" ("created_at");



CREATE INDEX "chess_observations_history_idx" ON "public"."chess_observations" USING "btree" ("teacher_id", "student_id", "observed_at" DESC);



CREATE INDEX "chess_observations_session_idx" ON "public"."chess_observations" USING "btree" ("teacher_id", "session_id");



CREATE INDEX "chess_resources_session_idx" ON "public"."chess_learning_resources" USING "btree" ("teacher_id", "session_id");



CREATE INDEX "chess_resources_student_idx" ON "public"."chess_learning_resources" USING "btree" ("teacher_id", "student_id", "created_at" DESC);



CREATE INDEX "chess_skill_categories_teacher_idx" ON "public"."chess_skill_categories" USING "btree" ("teacher_id", "sort_order");



CREATE INDEX "class_groups_workplace_idx" ON "public"."class_groups" USING "btree" ("teacher_id", "workplace_id");



CREATE INDEX "group_enrollments_teacher_student_idx" ON "public"."group_enrollments" USING "btree" ("teacher_id", "student_id");



CREATE INDEX "idx_credit_packages_student" ON "public"."credit_packages" USING "btree" ("student_id");



CREATE INDEX "idx_credit_packages_teacher" ON "public"."credit_packages" USING "btree" ("teacher_id");



CREATE INDEX "idx_credit_redemptions_package" ON "public"."credit_redemptions" USING "btree" ("package_id");



CREATE INDEX "idx_event_rsvps_guardian" ON "public"."event_rsvps" USING "btree" ("guardian_id");



CREATE INDEX "idx_event_students_student" ON "public"."event_students" USING "btree" ("student_id");



CREATE INDEX "idx_events_teacher_starts" ON "public"."events" USING "btree" ("teacher_id", "starts_at");



CREATE INDEX "idx_guardians_portal_token" ON "public"."guardians" USING "btree" ("portal_token");



CREATE INDEX "idx_guardians_teacher" ON "public"."guardians" USING "btree" ("teacher_id");



CREATE INDEX "idx_invoice_items_invoice" ON "public"."invoice_items" USING "btree" ("invoice_id");



CREATE INDEX "idx_invoices_guardian" ON "public"."invoices" USING "btree" ("guardian_id");



CREATE INDEX "idx_invoices_status" ON "public"."invoices" USING "btree" ("teacher_id", "status");



CREATE INDEX "idx_invoices_teacher" ON "public"."invoices" USING "btree" ("teacher_id");



CREATE INDEX "idx_lesson_slots_student" ON "public"."lesson_slots" USING "btree" ("student_id");



CREATE INDEX "idx_lesson_slots_teacher" ON "public"."lesson_slots" USING "btree" ("teacher_id");



CREATE INDEX "idx_lessons_rescheduled" ON "public"."lessons" USING "btree" ("teacher_id") WHERE ("rescheduled_from_date" IS NOT NULL);



CREATE INDEX "idx_lessons_student" ON "public"."lessons" USING "btree" ("student_id");



CREATE INDEX "idx_lessons_teacher_date" ON "public"."lessons" USING "btree" ("teacher_id", "lesson_date");



CREATE INDEX "idx_notifications_teacher_created" ON "public"."notifications" USING "btree" ("teacher_id", "created_at" DESC);



CREATE INDEX "idx_notifications_teacher_unread" ON "public"."notifications" USING "btree" ("teacher_id") WHERE ("read_at" IS NULL);



CREATE INDEX "idx_payments_invoice" ON "public"."payments" USING "btree" ("invoice_id");



CREATE INDEX "idx_push_subscriptions_teacher" ON "public"."push_subscriptions" USING "btree" ("teacher_id");



CREATE INDEX "idx_skill_assessments_dimension" ON "public"."skill_assessments" USING "btree" ("dimension_id");



CREATE INDEX "idx_skill_assessments_student" ON "public"."skill_assessments" USING "btree" ("student_id", "assessed_on");



CREATE INDEX "idx_skill_dimensions_teacher" ON "public"."skill_dimensions" USING "btree" ("teacher_id");



CREATE INDEX "idx_students_guardian" ON "public"."students" USING "btree" ("guardian_id");



CREATE INDEX "idx_students_teacher" ON "public"."students" USING "btree" ("teacher_id");



CREATE UNIQUE INDEX "idx_teachers_calendar_token" ON "public"."teachers" USING "btree" ("calendar_token");



CREATE UNIQUE INDEX "notifications_one_welcome_per_teacher" ON "public"."notifications" USING "btree" ("teacher_id") WHERE ("type" = 'welcome'::"text");



CREATE UNIQUE INDEX "payments_invoice_external_unique" ON "public"."payments" USING "btree" ("invoice_id", "external_id") WHERE ("external_id" IS NOT NULL);



CREATE INDEX "session_attendance_teacher_idx" ON "public"."session_attendance" USING "btree" ("teacher_id", "session_id");



CREATE INDEX "session_participants_teacher_idx" ON "public"."session_participants" USING "btree" ("teacher_id", "session_id");



CREATE INDEX "students_teacher_active_idx" ON "public"."students" USING "btree" ("teacher_id") WHERE ("archived_at" IS NULL);



CREATE INDEX "teaching_sessions_teacher_start_idx" ON "public"."teaching_sessions" USING "btree" ("teacher_id", "starts_at" DESC);



CREATE INDEX "workplace_enrollments_student_idx" ON "public"."workplace_enrollments" USING "btree" ("teacher_id", "student_id");



CREATE INDEX "workplaces_teacher_idx" ON "public"."workplaces" USING "btree" ("teacher_id");



CREATE OR REPLACE TRIGGER "chesscoachpal_seed_chess_skills" AFTER INSERT ON "public"."teachers" FOR EACH ROW EXECUTE FUNCTION "public"."chesscoachpal_seed_chess_skills"();



CREATE OR REPLACE TRIGGER "chesscoachpal_seed_workplace" AFTER INSERT ON "public"."teachers" FOR EACH ROW EXECUTE FUNCTION "public"."chesscoachpal_seed_workplace"();



CREATE OR REPLACE TRIGGER "chesscoachpal_snapshot_participants" AFTER INSERT ON "public"."teaching_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."chesscoachpal_snapshot_participants"();



CREATE OR REPLACE TRIGGER "credit_packages_immutability" BEFORE UPDATE ON "public"."credit_packages" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_credit_package_immutability"();



CREATE OR REPLACE TRIGGER "credit_redemptions_rules" BEFORE INSERT OR UPDATE ON "public"."credit_redemptions" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_credit_redemption_rules"();



CREATE OR REPLACE TRIGGER "invoice_items_freeze" BEFORE DELETE OR UPDATE ON "public"."invoice_items" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_invoice_item_freeze"();



CREATE OR REPLACE TRIGGER "invoice_items_not_redeemed" BEFORE INSERT OR UPDATE ON "public"."invoice_items" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_invoice_item_not_redeemed"();



CREATE OR REPLACE TRIGGER "invoices_delete_rules" BEFORE DELETE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_invoice_delete_rules"();



CREATE OR REPLACE TRIGGER "invoices_immutability" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_invoice_immutability"();



CREATE OR REPLACE TRIGGER "invoices_package_void" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_package_invoice_void"();



CREATE OR REPLACE TRIGGER "lesson_notes_updated_at" BEFORE UPDATE ON "public"."lesson_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "payments_reopen_invoice" AFTER DELETE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."reopen_underpaid_invoice"();



CREATE OR REPLACE TRIGGER "payments_rules" BEFORE DELETE OR UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_payment_rules"();



CREATE OR REPLACE TRIGGER "studio_policies_updated_at" BEFORE UPDATE ON "public"."studio_policies" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."agent_oauth_codes"
    ADD CONSTRAINT "agent_oauth_codes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."agent_oauth_clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_oauth_codes"
    ADD CONSTRAINT "agent_oauth_codes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_oauth_grants"
    ADD CONSTRAINT "agent_oauth_grants_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."agent_oauth_clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_oauth_grants"
    ADD CONSTRAINT "agent_oauth_grants_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_tool_receipts"
    ADD CONSTRAINT "agent_tool_receipts_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chess_learning_resources"
    ADD CONSTRAINT "chess_learning_resources_session_id_student_id_fkey" FOREIGN KEY ("session_id", "student_id") REFERENCES "public"."session_participants"("session_id", "student_id");



ALTER TABLE ONLY "public"."chess_learning_resources"
    ADD CONSTRAINT "chess_learning_resources_session_id_teacher_id_fkey" FOREIGN KEY ("session_id", "teacher_id") REFERENCES "public"."teaching_sessions"("id", "teacher_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chess_learning_resources"
    ADD CONSTRAINT "chess_learning_resources_student_id_teacher_id_fkey" FOREIGN KEY ("student_id", "teacher_id") REFERENCES "public"."students"("id", "teacher_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chess_learning_resources"
    ADD CONSTRAINT "chess_learning_resources_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chess_observations"
    ADD CONSTRAINT "chess_observations_category_id_teacher_id_fkey" FOREIGN KEY ("category_id", "teacher_id") REFERENCES "public"."chess_skill_categories"("id", "teacher_id");



ALTER TABLE ONLY "public"."chess_observations"
    ADD CONSTRAINT "chess_observations_session_id_student_id_fkey" FOREIGN KEY ("session_id", "student_id") REFERENCES "public"."session_participants"("session_id", "student_id");



ALTER TABLE ONLY "public"."chess_observations"
    ADD CONSTRAINT "chess_observations_session_id_teacher_id_fkey" FOREIGN KEY ("session_id", "teacher_id") REFERENCES "public"."teaching_sessions"("id", "teacher_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chess_observations"
    ADD CONSTRAINT "chess_observations_student_id_teacher_id_fkey" FOREIGN KEY ("student_id", "teacher_id") REFERENCES "public"."students"("id", "teacher_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chess_observations"
    ADD CONSTRAINT "chess_observations_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chess_skill_categories"
    ADD CONSTRAINT "chess_skill_categories_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_groups"
    ADD CONSTRAINT "class_groups_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_groups"
    ADD CONSTRAINT "class_groups_workplace_id_teacher_id_fkey" FOREIGN KEY ("workplace_id", "teacher_id") REFERENCES "public"."workplaces"("id", "teacher_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_packages"
    ADD CONSTRAINT "credit_packages_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_packages"
    ADD CONSTRAINT "credit_packages_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_packages"
    ADD CONSTRAINT "credit_packages_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_redemptions"
    ADD CONSTRAINT "credit_redemptions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_redemptions"
    ADD CONSTRAINT "credit_redemptions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."credit_packages"("id");



ALTER TABLE ONLY "public"."credit_redemptions"
    ADD CONSTRAINT "credit_redemptions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_rsvps"
    ADD CONSTRAINT "event_rsvps_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_rsvps"
    ADD CONSTRAINT "event_rsvps_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_students"
    ADD CONSTRAINT "event_students_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_students"
    ADD CONSTRAINT "event_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_enrollments"
    ADD CONSTRAINT "group_enrollments_group_id_teacher_id_workplace_id_fkey" FOREIGN KEY ("group_id", "teacher_id", "workplace_id") REFERENCES "public"."class_groups"("id", "teacher_id", "workplace_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_enrollments"
    ADD CONSTRAINT "group_enrollments_student_id_teacher_id_fkey" FOREIGN KEY ("student_id", "teacher_id") REFERENCES "public"."students"("id", "teacher_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_enrollments"
    ADD CONSTRAINT "group_enrollments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_enrollments"
    ADD CONSTRAINT "group_enrollments_teacher_id_workplace_id_student_id_fkey" FOREIGN KEY ("teacher_id", "workplace_id", "student_id") REFERENCES "public"."workplace_enrollments"("teacher_id", "workplace_id", "student_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."guardians"
    ADD CONSTRAINT "guardians_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_notes"
    ADD CONSTRAINT "lesson_notes_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_slots"
    ADD CONSTRAINT "lesson_slots_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_slots"
    ADD CONSTRAINT "lesson_slots_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_makeup_for_fkey" FOREIGN KEY ("makeup_for") REFERENCES "public"."attendance"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "public"."lesson_slots"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_attendance"
    ADD CONSTRAINT "session_attendance_session_id_student_id_fkey" FOREIGN KEY ("session_id", "student_id") REFERENCES "public"."session_participants"("session_id", "student_id");



ALTER TABLE ONLY "public"."session_attendance"
    ADD CONSTRAINT "session_attendance_session_id_teacher_id_fkey" FOREIGN KEY ("session_id", "teacher_id") REFERENCES "public"."teaching_sessions"("id", "teacher_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_attendance"
    ADD CONSTRAINT "session_attendance_student_id_teacher_id_fkey" FOREIGN KEY ("student_id", "teacher_id") REFERENCES "public"."students"("id", "teacher_id");



ALTER TABLE ONLY "public"."session_attendance"
    ADD CONSTRAINT "session_attendance_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_participants"
    ADD CONSTRAINT "session_participants_session_id_teacher_id_fkey" FOREIGN KEY ("session_id", "teacher_id") REFERENCES "public"."teaching_sessions"("id", "teacher_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_participants"
    ADD CONSTRAINT "session_participants_student_id_teacher_id_fkey" FOREIGN KEY ("student_id", "teacher_id") REFERENCES "public"."students"("id", "teacher_id");



ALTER TABLE ONLY "public"."session_participants"
    ADD CONSTRAINT "session_participants_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."skill_assessments"
    ADD CONSTRAINT "skill_assessments_dimension_id_fkey" FOREIGN KEY ("dimension_id") REFERENCES "public"."skill_dimensions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."skill_assessments"
    ADD CONSTRAINT "skill_assessments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."skill_dimensions"
    ADD CONSTRAINT "skill_dimensions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."studio_policies"
    ADD CONSTRAINT "studio_policies_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teaching_sessions"
    ADD CONSTRAINT "teaching_sessions_group_id_teacher_id_workplace_id_fkey" FOREIGN KEY ("group_id", "teacher_id", "workplace_id") REFERENCES "public"."class_groups"("id", "teacher_id", "workplace_id");



ALTER TABLE ONLY "public"."teaching_sessions"
    ADD CONSTRAINT "teaching_sessions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teaching_sessions"
    ADD CONSTRAINT "teaching_sessions_teacher_id_workplace_id_student_id_fkey" FOREIGN KEY ("teacher_id", "workplace_id", "student_id") REFERENCES "public"."workplace_enrollments"("teacher_id", "workplace_id", "student_id");



ALTER TABLE ONLY "public"."teaching_sessions"
    ADD CONSTRAINT "teaching_sessions_workplace_id_teacher_id_fkey" FOREIGN KEY ("workplace_id", "teacher_id") REFERENCES "public"."workplaces"("id", "teacher_id");



ALTER TABLE ONLY "public"."workplace_enrollments"
    ADD CONSTRAINT "workplace_enrollments_student_id_teacher_id_fkey" FOREIGN KEY ("student_id", "teacher_id") REFERENCES "public"."students"("id", "teacher_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workplace_enrollments"
    ADD CONSTRAINT "workplace_enrollments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workplace_enrollments"
    ADD CONSTRAINT "workplace_enrollments_workplace_id_teacher_id_fkey" FOREIGN KEY ("workplace_id", "teacher_id") REFERENCES "public"."workplaces"("id", "teacher_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workplaces"
    ADD CONSTRAINT "workplaces_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE "public"."agent_oauth_clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_oauth_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_oauth_grants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_tool_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_teacher" ON "public"."attendance" USING (("lesson_id" IN ( SELECT "lessons"."id"
   FROM "public"."lessons"
  WHERE ("lessons"."teacher_id" = "auth"."uid"()))));



ALTER TABLE "public"."chess_learning_resources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chess_learning_resources_teacher" ON "public"."chess_learning_resources" TO "authenticated" USING (("teacher_id" = "auth"."uid"())) WITH CHECK (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."chess_observations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chess_observations_teacher" ON "public"."chess_observations" TO "authenticated" USING (("teacher_id" = "auth"."uid"())) WITH CHECK (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."chess_skill_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chess_skill_categories_teacher" ON "public"."chess_skill_categories" TO "authenticated" USING (("teacher_id" = "auth"."uid"())) WITH CHECK (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."class_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "class_groups_teacher" ON "public"."class_groups" TO "authenticated" USING (("teacher_id" = "auth"."uid"())) WITH CHECK (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."credit_packages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credit_packages_teacher" ON "public"."credit_packages" USING (("teacher_id" = "auth"."uid"())) WITH CHECK ((("teacher_id" = "auth"."uid"()) AND ("student_id" IN ( SELECT "students"."id"
   FROM "public"."students"
  WHERE ("students"."teacher_id" = "auth"."uid"()))) AND ("invoice_id" IN ( SELECT "invoices"."id"
   FROM "public"."invoices"
  WHERE ("invoices"."teacher_id" = "auth"."uid"())))));



ALTER TABLE "public"."credit_redemptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credit_redemptions_teacher" ON "public"."credit_redemptions" USING (("teacher_id" = "auth"."uid"())) WITH CHECK (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."event_rsvps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_rsvps_teacher" ON "public"."event_rsvps" USING ((EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_rsvps"."event_id") AND ("e"."teacher_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_rsvps"."event_id") AND ("e"."teacher_id" = "auth"."uid"())))));



ALTER TABLE "public"."event_students" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_students_teacher" ON "public"."event_students" USING ((EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_students"."event_id") AND ("e"."teacher_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_students"."event_id") AND ("e"."teacher_id" = "auth"."uid"())))));



ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "events_teacher" ON "public"."events" USING (("teacher_id" = "auth"."uid"())) WITH CHECK (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."group_enrollments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_enrollments_teacher" ON "public"."group_enrollments" TO "authenticated" USING (("teacher_id" = "auth"."uid"())) WITH CHECK (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."guardians" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "guardians_teacher" ON "public"."guardians" USING (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."invoice_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_items_teacher" ON "public"."invoice_items" USING (("invoice_id" IN ( SELECT "invoices"."id"
   FROM "public"."invoices"
  WHERE ("invoices"."teacher_id" = "auth"."uid"()))));



ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoices_teacher" ON "public"."invoices" USING (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."lesson_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lesson_notes_teacher" ON "public"."lesson_notes" USING (("lesson_id" IN ( SELECT "lessons"."id"
   FROM "public"."lessons"
  WHERE ("lessons"."teacher_id" = "auth"."uid"()))));



ALTER TABLE "public"."lesson_slots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lesson_slots_teacher" ON "public"."lesson_slots" USING (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."lessons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lessons_teacher" ON "public"."lessons" USING (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_teacher" ON "public"."notifications" USING (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_teacher" ON "public"."payments" USING (("invoice_id" IN ( SELECT "invoices"."id"
   FROM "public"."invoices"
  WHERE ("invoices"."teacher_id" = "auth"."uid"()))));



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_subscriptions_teacher" ON "public"."push_subscriptions" USING (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."session_attendance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "session_attendance_teacher" ON "public"."session_attendance" TO "authenticated" USING (("teacher_id" = "auth"."uid"())) WITH CHECK (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."session_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "session_participants_teacher" ON "public"."session_participants" FOR SELECT TO "authenticated" USING (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."skill_assessments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "skill_assessments_teacher" ON "public"."skill_assessments" USING (("student_id" IN ( SELECT "students"."id"
   FROM "public"."students"
  WHERE ("students"."teacher_id" = "auth"."uid"()))));



ALTER TABLE "public"."skill_dimensions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "skill_dimensions_teacher" ON "public"."skill_dimensions" USING (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."students" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "students_teacher" ON "public"."students" USING (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."studio_policies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "studio_policies_teacher" ON "public"."studio_policies" USING (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."teachers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teachers_own" ON "public"."teachers" USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."teaching_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teaching_sessions_teacher" ON "public"."teaching_sessions" TO "authenticated" USING (("teacher_id" = "auth"."uid"())) WITH CHECK (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."waitlist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workplace_enrollments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workplace_enrollments_teacher" ON "public"."workplace_enrollments" TO "authenticated" USING (("teacher_id" = "auth"."uid"())) WITH CHECK (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."workplaces" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workplaces_teacher" ON "public"."workplaces" TO "authenticated" USING (("teacher_id" = "auth"."uid"())) WITH CHECK (("teacher_id" = "auth"."uid"()));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."agent_record_attendance"("p_session_id" "uuid", "p_student_id" "uuid", "p_status" "text", "p_note" "text", "p_expected_updated_at" timestamp with time zone, "p_idempotency_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agent_record_attendance"("p_session_id" "uuid", "p_student_id" "uuid", "p_status" "text", "p_note" "text", "p_expected_updated_at" timestamp with time zone, "p_idempotency_key" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_record_attendance"("p_session_id" "uuid", "p_student_id" "uuid", "p_status" "text", "p_note" "text", "p_expected_updated_at" timestamp with time zone, "p_idempotency_key" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."agent_update_session_note"("p_session_id" "uuid", "p_lesson_note" "text", "p_expected_updated_at" timestamp with time zone, "p_idempotency_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agent_update_session_note"("p_session_id" "uuid", "p_lesson_note" "text", "p_expected_updated_at" timestamp with time zone, "p_idempotency_key" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_update_session_note"("p_session_id" "uuid", "p_lesson_note" "text", "p_expected_updated_at" timestamp with time zone, "p_idempotency_key" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."chesscoachpal_seed_chess_skills"() TO "anon";
GRANT ALL ON FUNCTION "public"."chesscoachpal_seed_chess_skills"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."chesscoachpal_seed_chess_skills"() TO "service_role";



GRANT ALL ON FUNCTION "public"."chesscoachpal_seed_workplace"() TO "anon";
GRANT ALL ON FUNCTION "public"."chesscoachpal_seed_workplace"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."chesscoachpal_seed_workplace"() TO "service_role";



GRANT ALL ON FUNCTION "public"."chesscoachpal_snapshot_participants"() TO "anon";
GRANT ALL ON FUNCTION "public"."chesscoachpal_snapshot_participants"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."chesscoachpal_snapshot_participants"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_credit_package_immutability"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_credit_package_immutability"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_credit_package_immutability"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_credit_redemption_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_credit_redemption_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_credit_redemption_rules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_invoice_delete_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_invoice_delete_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_invoice_delete_rules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_invoice_immutability"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_invoice_immutability"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_invoice_immutability"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_invoice_item_freeze"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_invoice_item_freeze"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_invoice_item_freeze"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_invoice_item_not_redeemed"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_invoice_item_not_redeemed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_invoice_item_not_redeemed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_package_invoice_void"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_package_invoice_void"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_package_invoice_void"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_payment_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_payment_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_payment_rules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reopen_underpaid_invoice"() TO "anon";
GRANT ALL ON FUNCTION "public"."reopen_underpaid_invoice"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reopen_underpaid_invoice"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."agent_oauth_clients" TO "service_role";



GRANT ALL ON TABLE "public"."agent_oauth_codes" TO "service_role";



GRANT ALL ON TABLE "public"."agent_oauth_grants" TO "service_role";



GRANT ALL ON TABLE "public"."agent_tool_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance" TO "service_role";



GRANT ALL ON TABLE "public"."chess_learning_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."chess_learning_resources" TO "service_role";



GRANT ALL ON TABLE "public"."chess_observations" TO "authenticated";
GRANT ALL ON TABLE "public"."chess_observations" TO "service_role";



GRANT ALL ON TABLE "public"."chess_skill_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."chess_skill_categories" TO "service_role";



GRANT ALL ON TABLE "public"."class_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."class_groups" TO "service_role";



GRANT ALL ON TABLE "public"."credit_packages" TO "anon";
GRANT ALL ON TABLE "public"."credit_packages" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_packages" TO "service_role";



GRANT ALL ON TABLE "public"."credit_redemptions" TO "anon";
GRANT ALL ON TABLE "public"."credit_redemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_redemptions" TO "service_role";



GRANT ALL ON TABLE "public"."event_rsvps" TO "authenticated";
GRANT ALL ON TABLE "public"."event_rsvps" TO "service_role";



GRANT ALL ON TABLE "public"."event_students" TO "authenticated";
GRANT ALL ON TABLE "public"."event_students" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."group_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."group_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."guardians" TO "authenticated";
GRANT ALL ON TABLE "public"."guardians" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_items" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_items" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."lesson_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_notes" TO "service_role";



GRANT ALL ON TABLE "public"."lesson_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_slots" TO "service_role";



GRANT ALL ON TABLE "public"."lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."lessons" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."session_attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."session_attendance" TO "service_role";



GRANT ALL ON TABLE "public"."session_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."session_participants" TO "service_role";



GRANT ALL ON TABLE "public"."skill_assessments" TO "authenticated";
GRANT ALL ON TABLE "public"."skill_assessments" TO "service_role";



GRANT ALL ON TABLE "public"."skill_dimensions" TO "authenticated";
GRANT ALL ON TABLE "public"."skill_dimensions" TO "service_role";



GRANT ALL ON TABLE "public"."students" TO "authenticated";
GRANT ALL ON TABLE "public"."students" TO "service_role";



GRANT ALL ON TABLE "public"."studio_policies" TO "authenticated";
GRANT ALL ON TABLE "public"."studio_policies" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."teachers" TO "authenticated";
GRANT ALL ON TABLE "public"."teachers" TO "service_role";



GRANT UPDATE("email") ON TABLE "public"."teachers" TO "authenticated";



GRANT UPDATE("display_name") ON TABLE "public"."teachers" TO "authenticated";



GRANT UPDATE("avatar_url") ON TABLE "public"."teachers" TO "authenticated";



GRANT UPDATE("onboarding_tour_completed_at") ON TABLE "public"."teachers" TO "authenticated";



GRANT UPDATE("calendar_token") ON TABLE "public"."teachers" TO "authenticated";



GRANT ALL ON TABLE "public"."teaching_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."teaching_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."waitlist" TO "authenticated";
GRANT ALL ON TABLE "public"."waitlist" TO "service_role";



GRANT ALL ON TABLE "public"."workplace_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."workplace_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."workplaces" TO "authenticated";
GRANT ALL ON TABLE "public"."workplaces" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







