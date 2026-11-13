-- ChessCoachPal: canonical fresh-install database schema.
-- One installation snapshot, no upgrade chain, compatibility mapping, or
-- historical development-database conversion. Reset disposable prelaunch
-- databases explicitly after changing this schema; never erase actual user
-- data without the operator's informed authorization.

-- CHESSCOACHPAL v0.x CANONICAL FRESH-ONLY SCHEMA
-- Generated from the disposable Supabase stack at Milestone 4.
-- No upgrade/compatibility promises before v1.0.0.
-- Never apply this by resetting a database containing real data.
-- Historical music/practice tables, enums and data are intentionally absent.



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
  -- Frozen roster begins with no explicit attendance decisions.
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

  -- Canonical entries are verified by the scoped new trigger below.
  -- This intermediate branch still contains old fixtures; only the final
  -- fresh-install snapshot may eliminate the inherited branch entirely.
  IF NEW.session_id IS NOT NULL THEN
    RETURN NEW;
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
    -- During implementation old test fixtures still use lesson_id; the
    -- completed cutover removes it and requires the canonical participant.
    "lesson_id" "uuid",
    "session_id" "uuid",
    "student_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "credit_redemptions_single_occurrence_check" CHECK (
      (lesson_id IS NOT NULL AND session_id IS NULL AND student_id IS NULL) OR
      (lesson_id IS NULL AND session_id IS NOT NULL AND student_id IS NOT NULL)
    )
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
    "session_id" "uuid",
    "student_id" "uuid",
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
    "workplace_id" "uuid",
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
    "status" "text" NOT NULL,
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "notice_at" timestamp with time zone,
    "cancelled_by" "text",
    "cancel_reason" "text" DEFAULT ''::"text" NOT NULL,
    "marked_at" timestamp with time zone,
    "marked_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "session_attendance_note_check" CHECK (("char_length"("note") <= 5000)),
    CONSTRAINT "session_attendance_cancel_reason_check" CHECK (("char_length"("cancel_reason") <= 1000)),
    CONSTRAINT "session_attendance_cancellation_metadata_check" CHECK (
      (status='student_cancelled' AND cancelled_by='student' AND notice_at IS NOT NULL) OR
      (status='teacher_cancelled' AND cancelled_by='teacher') OR
      (status NOT IN ('student_cancelled','teacher_cancelled') AND cancelled_by IS NULL AND notice_at IS NULL AND cancel_reason='')
    ),
    CONSTRAINT "session_attendance_status_check" CHECK (("status" = ANY (ARRAY['present'::"text", 'absent'::"text", 'late'::"text", 'excused'::"text", 'student_cancelled'::"text", 'teacher_cancelled'::"text"])))
);


ALTER TABLE "public"."session_attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_participants" (
    "teacher_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL
);


ALTER TABLE "public"."session_participants" OWNER TO "postgres";


-- A note belongs to a canonical session, optionally scoped to one frozen
-- participant. Shared and teacher-private text have distinct fields. There
-- is no backwards-compatible lesson_notes view or second occurrence ledger.
CREATE TABLE IF NOT EXISTS "public"."session_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "student_id" "uuid",
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "private_body" "text" DEFAULT ''::"text" NOT NULL,
    "shared_with_guardian" boolean DEFAULT false NOT NULL,
    "emailed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "session_notes_body_check" CHECK ("char_length"("body") <= 10000),
    CONSTRAINT "session_notes_private_body_check" CHECK ("char_length"("private_body") <= 10000)
);
ALTER TABLE "public"."session_notes" OWNER TO "postgres";
COMMENT ON COLUMN "public"."session_notes"."private_body" IS
  'Teacher-private coaching notes. Never disclose through guardian token or public calendar.';



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
    -- Recurrence intent and stable original occurrence date are separate from
    -- the actual scheduled start time; moving a session must not re-materialize
    -- another occurrence for the vacated slot/date pair.
    "slot_id" "uuid",
    "slot_rate_cents" integer,
    "slot_occurrence_date" "date",
    "local_timezone" "text",
    "is_home_visit" boolean DEFAULT false NOT NULL,
    "rescheduled_from_date" "date",
    "makeup_for_session_id" "uuid",
    "makeup_for_student_id" "uuid",
    CONSTRAINT "teaching_sessions_slot_identity_check" CHECK (
       "slot_id" IS NULL OR "slot_occurrence_date" IS NOT NULL),
    CONSTRAINT "teaching_sessions_makeup_pair_check" CHECK (
       ("makeup_for_session_id" IS NULL) = ("makeup_for_student_id" IS NULL)),
    CONSTRAINT "teaching_sessions_check" CHECK ((("group_id" IS NULL) <> ("student_id" IS NULL))),
    CONSTRAINT "teaching_sessions_duration_minutes_check" CHECK ((("duration_minutes" >= 15) AND ("duration_minutes" <= 480))),
    CONSTRAINT "teaching_sessions_lesson_note_check" CHECK (("char_length"("lesson_note") <= 10000)),
    CONSTRAINT "teaching_sessions_slot_rate_check" CHECK (
      "slot_rate_cents" IS NULL OR "slot_rate_cents">=0),
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

ALTER TABLE ONLY "public"."lesson_slots"
    ADD CONSTRAINT "lesson_slots_id_teacher_unique" UNIQUE ("id", "teacher_id");



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

ALTER TABLE ONLY "public"."session_participants"
    ADD CONSTRAINT "session_participants_scoped_unique"
    UNIQUE ("session_id", "student_id", "teacher_id");

ALTER TABLE ONLY "public"."session_notes"
    ADD CONSTRAINT "session_notes_pkey" PRIMARY KEY ("id");

CREATE UNIQUE INDEX "session_notes_session_student_unique"
  ON "public"."session_notes" ("session_id", "student_id") NULLS NOT DISTINCT;

-- A regular UNIQUE index (NULLs distinct) allows any number of ad hoc
-- sessions without a slot, while supporting atomic ON CONFLICT DO NOTHING
-- materialization for a specific slot and local occurrence date.
CREATE UNIQUE INDEX "teaching_sessions_slot_occurrence_unique"
  ON "public"."teaching_sessions" ("slot_id", "slot_occurrence_date");




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



CREATE OR REPLACE TRIGGER "session_notes_updated_at" BEFORE UPDATE ON "public"."session_notes"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

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



CREATE UNIQUE INDEX credit_redemptions_canonical_occurrence_unique
  ON "public"."credit_redemptions" ("session_id","student_id")
  WHERE "session_id" IS NOT NULL;

ALTER TABLE ONLY "public"."credit_redemptions"
    ADD CONSTRAINT "credit_redemptions_session_participant_fkey"
    FOREIGN KEY ("session_id","student_id")
    REFERENCES "public"."session_participants" ("session_id","student_id")
    ON DELETE RESTRICT;

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
    ADD CONSTRAINT "invoice_items_session_participant_fkey"
    FOREIGN KEY ("session_id","student_id")
    REFERENCES "public"."session_participants" ("session_id","student_id")
    ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_notes"
    ADD CONSTRAINT "lesson_notes_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_slots"
    ADD CONSTRAINT "lesson_slots_workplace_teacher_fkey"
    FOREIGN KEY ("workplace_id", "teacher_id")
    REFERENCES "public"."workplaces" ("id", "teacher_id") ON DELETE RESTRICT;

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



ALTER TABLE ONLY "public"."session_notes"
    ADD CONSTRAINT "session_notes_session_teacher_fkey"
    FOREIGN KEY ("session_id", "teacher_id")
    REFERENCES "public"."teaching_sessions" ("id", "teacher_id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."session_notes"
    ADD CONSTRAINT "session_notes_participant_fkey"
    FOREIGN KEY ("session_id", "student_id")
    REFERENCES "public"."session_participants" ("session_id", "student_id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."teaching_sessions"
    ADD CONSTRAINT "teaching_sessions_slot_fkey"
    FOREIGN KEY ("slot_id", "teacher_id")
    REFERENCES "public"."lesson_slots" ("id", "teacher_id") ON DELETE SET NULL ("slot_id");

ALTER TABLE ONLY "public"."teaching_sessions"
    ADD CONSTRAINT "teaching_sessions_makeup_participant_fkey"
    FOREIGN KEY ("makeup_for_session_id", "makeup_for_student_id", "teacher_id")
    REFERENCES "public"."session_participants" ("session_id", "student_id", "teacher_id") ON DELETE RESTRICT;

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

ALTER TABLE "public"."session_notes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "session_notes_teacher" ON "public"."session_notes"
  TO "authenticated"
  USING (("teacher_id" = "auth"."uid"()))
  WITH CHECK (("teacher_id" = "auth"."uid"()));


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



-- Only the audited SECURITY DEFINER domain transaction may change decisions.
-- Ordinary owner clients retain RLS-scoped SELECT, not direct DML privileges.
GRANT SELECT ON TABLE "public"."session_attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."session_attendance" TO "service_role";



GRANT ALL ON TABLE "public"."session_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."session_participants" TO "service_role";
GRANT SELECT ON TABLE "public"."session_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."session_notes" TO "service_role";



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








-- Supabase storage is outside public and is not emitted by the public schema dump.
-- Avatars are the only application-managed bucket in v0.1.0.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Object keys: <teacher-id>/avatar.webp (upserted on replace)

create policy avatars_storage_select on storage.objects
  for select
  using (bucket_id = 'avatars');

create policy avatars_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );




-- BEGIN ChessCoachPal typed learning materials (fresh-install canonical schema).
-- A shared catalog ID links games, puzzles, drills and study chapters without
-- treating all chess content as a game or claiming a link was taught.
CREATE TABLE public.learning_materials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('game','puzzle','drill','study_chapter','external_link')),
 title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
 description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
 source_url text CHECK (source_url IS NULL OR (source_url ~ '^https://[^[:space:]]+$' AND char_length(source_url) <= 2048)),
 request_id uuid NOT NULL,
 request_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (teacher_id,id),
 UNIQUE (teacher_id,request_id)
);
CREATE INDEX learning_materials_search ON public.learning_materials (teacher_id,kind,created_at DESC);

-- Student/session links point to the single typed material catalog. They have
-- no duplicate label, URL or provider identity, and cannot imply teaching.
CREATE TABLE public.material_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  material_id uuid NOT NULL,
  student_id uuid,
  session_id uuid,
  request_id uuid NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision>=1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_links_target_required CHECK (student_id IS NOT NULL OR session_id IS NOT NULL),
  CONSTRAINT material_links_teacher_request UNIQUE(teacher_id,request_id),
  CONSTRAINT material_links_material_owner
    FOREIGN KEY(teacher_id,material_id) REFERENCES public.learning_materials(teacher_id,id) ON DELETE RESTRICT,
  CONSTRAINT material_links_student_owner
    FOREIGN KEY(student_id,teacher_id) REFERENCES public.students(id,teacher_id) ON DELETE RESTRICT,
  CONSTRAINT material_links_session_owner
    FOREIGN KEY(session_id,teacher_id) REFERENCES public.teaching_sessions(id,teacher_id) ON DELETE RESTRICT,
  CONSTRAINT material_links_session_student_member
    FOREIGN KEY(session_id,student_id) REFERENCES public.session_participants(session_id,student_id) ON DELETE RESTRICT
);
CREATE INDEX material_links_student_recent ON public.material_links(teacher_id,student_id,created_at DESC);
CREATE INDEX material_links_session_recent ON public.material_links(teacher_id,session_id,created_at DESC);
CREATE INDEX material_links_material_recent ON public.material_links(teacher_id,material_id);
ALTER TABLE public.material_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY material_links_teacher_owner ON public.material_links
 FOR ALL TO authenticated USING(teacher_id=auth.uid()) WITH CHECK(teacher_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.material_links TO authenticated;
GRANT ALL ON public.material_links TO service_role;

CREATE FUNCTION public.ccp_material_links_validate() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $links$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (NEW.id,NEW.teacher_id,NEW.student_id,NEW.session_id,NEW.request_id,NEW.created_at)
      IS DISTINCT FROM
       (OLD.id,OLD.teacher_id,OLD.student_id,OLD.session_id,OLD.request_id,OLD.created_at)
    THEN RAISE EXCEPTION 'MATERIAL_LINK_SCOPE_IMMUTABLE' USING ERRCODE='22023'; END IF;
    NEW.revision:=OLD.revision+1;
  END IF;
  -- Lock the material row so concurrent archives cannot race a new link.
  PERFORM 1 FROM public.learning_materials
    WHERE teacher_id=NEW.teacher_id AND id=NEW.material_id AND archived_at IS NULL
    FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MATERIAL_NOT_ACTIVE' USING ERRCODE='23503'; END IF;
  IF NEW.student_id IS NOT NULL THEN
    PERFORM 1 FROM public.students WHERE id=NEW.student_id AND teacher_id=NEW.teacher_id
      AND archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'STUDENT_NOT_ACTIVE' USING ERRCODE='23503'; END IF;
  END IF;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END;
$links$;
CREATE TRIGGER ccp_material_links_validate_trg
 BEFORE INSERT OR UPDATE ON public.material_links
 FOR EACH ROW EXECUTE FUNCTION public.ccp_material_links_validate();
REVOKE ALL ON FUNCTION public.ccp_material_links_validate() FROM PUBLIC,anon,authenticated;


CREATE TABLE public.chess_games (
 material_id uuid PRIMARY KEY,
 teacher_id uuid NOT NULL,
 pgn text NOT NULL CHECK (char_length(btrim(pgn)) BETWEEN 1 AND 150000),
 white_player text NOT NULL DEFAULT '' CHECK (char_length(white_player) <= 120),
 black_player text NOT NULL DEFAULT '' CHECK (char_length(black_player) <= 120),
 result text NOT NULL DEFAULT '*' CHECK (result IN ('1-0','0-1','1/2-1/2','*')),
 FOREIGN KEY (teacher_id,material_id) REFERENCES public.learning_materials(teacher_id,id) ON DELETE CASCADE
);
CREATE TABLE public.chess_puzzles (
 material_id uuid PRIMARY KEY,
 teacher_id uuid NOT NULL,
 fen text NOT NULL CHECK (char_length(btrim(fen)) BETWEEN 15 AND 150),
 solution text CHECK (solution IS NULL OR char_length(solution) <= 5000),
 themes text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK (cardinality(themes) <= 20),
 FOREIGN KEY (teacher_id,material_id) REFERENCES public.learning_materials(teacher_id,id) ON DELETE CASCADE
);
CREATE TABLE public.chess_drills (
 material_id uuid PRIMARY KEY,
 teacher_id uuid NOT NULL,
 instructions text NOT NULL CHECK (char_length(btrim(instructions)) BETWEEN 1 AND 5000),
 mode text NOT NULL DEFAULT 'other' CHECK (mode IN ('calculation','repetition','endgame','opening','other')),
 repetitions integer CHECK (repetitions IS NULL OR repetitions BETWEEN 1 AND 10000),
 FOREIGN KEY (teacher_id,material_id) REFERENCES public.learning_materials(teacher_id,id) ON DELETE CASCADE
);
CREATE TABLE public.chess_study_chapters (
 material_id uuid PRIMARY KEY,
 teacher_id uuid NOT NULL,
 provider text NOT NULL DEFAULT 'lichess' CHECK (provider IN ('lichess','other')),
 study_id text CHECK (study_id IS NULL OR char_length(study_id) BETWEEN 1 AND 128),
 chapter_id text CHECK (chapter_id IS NULL OR char_length(chapter_id) BETWEEN 1 AND 128),
 FOREIGN KEY (teacher_id,material_id) REFERENCES public.learning_materials(teacher_id,id) ON DELETE CASCADE
);
CREATE TABLE public.learning_material_relations (
 teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 from_material_id uuid NOT NULL,
 to_material_id uuid NOT NULL,
 relation_type text NOT NULL CHECK (relation_type IN ('extracted_from','derived_from','prerequisite')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (teacher_id,from_material_id,to_material_id,relation_type),
 FOREIGN KEY (teacher_id,from_material_id) REFERENCES public.learning_materials(teacher_id,id) ON DELETE CASCADE,
 FOREIGN KEY (teacher_id,to_material_id) REFERENCES public.learning_materials(teacher_id,id) ON DELETE CASCADE,
 CHECK (from_material_id <> to_material_id)
);

ALTER TABLE public.learning_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chess_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chess_puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chess_drills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chess_study_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_material_relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_learning_materials ON public.learning_materials
 FOR ALL TO authenticated USING (teacher_id=auth.uid()) WITH CHECK (teacher_id=auth.uid());
CREATE POLICY owner_chess_games ON public.chess_games
 FOR ALL TO authenticated USING (teacher_id=auth.uid()) WITH CHECK (teacher_id=auth.uid());
CREATE POLICY owner_chess_puzzles ON public.chess_puzzles
 FOR ALL TO authenticated USING (teacher_id=auth.uid()) WITH CHECK (teacher_id=auth.uid());
CREATE POLICY owner_chess_drills ON public.chess_drills
 FOR ALL TO authenticated USING (teacher_id=auth.uid()) WITH CHECK (teacher_id=auth.uid());
CREATE POLICY owner_chess_study_chapters ON public.chess_study_chapters
 FOR ALL TO authenticated USING (teacher_id=auth.uid()) WITH CHECK (teacher_id=auth.uid());
CREATE POLICY owner_learning_material_relations ON public.learning_material_relations
 FOR ALL TO authenticated USING (teacher_id=auth.uid()) WITH CHECK (teacher_id=auth.uid());
GRANT SELECT ON public.learning_materials,public.chess_games,public.chess_puzzles,
 public.chess_drills,public.chess_study_chapters,public.learning_material_relations TO authenticated;
GRANT SELECT,INSERT ON public.learning_materials,public.chess_games,public.chess_puzzles,
 public.chess_drills,public.chess_study_chapters,public.learning_material_relations TO service_role;

-- SECURITY DEFINER is intentionally limited to an authenticated user derived
-- solely from auth.uid(); the function never accepts caller-supplied teacher IDs.
-- A single transaction rolls back the catalog root on any subtype error.
CREATE FUNCTION public.ccp_material_catalog_create(
 p_kind text, p_title text, p_description text,
 p_source_url text, p_details jsonb, p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $ccp$
DECLARE
 v_teacher uuid := auth.uid();
 v_material uuid;
 v_hash text;
 v_previous public.learning_materials%ROWTYPE;
BEGIN
 IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 IF p_request_id IS NULL OR p_kind NOT IN ('game','puzzle','drill','study_chapter','external_link') OR
    char_length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 160 OR
    char_length(coalesce(p_description,'')) > 4000 OR
    (p_source_url IS NOT NULL AND
       (p_source_url !~ '^https://[^[:space:]]+$' OR char_length(p_source_url)>2048)) OR
    p_details IS NULL OR jsonb_typeof(p_details) <> 'object' THEN
   RAISE EXCEPTION 'VALIDATION_ERROR';
 END IF;
 v_hash := md5(jsonb_build_array(p_kind,btrim(p_title),coalesce(p_description,''),p_source_url,p_details)::text);
 SELECT * INTO v_previous FROM public.learning_materials
   WHERE teacher_id=v_teacher AND request_id=p_request_id;
 IF FOUND THEN
   IF v_previous.request_hash <> v_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('id',v_previous.id,'kind',v_previous.kind,'title',v_previous.title,'replayed',true);
 END IF;
 INSERT INTO public.learning_materials(teacher_id,kind,title,description,source_url,request_id,request_hash)
 VALUES(v_teacher,p_kind,btrim(p_title),coalesce(p_description,''),p_source_url,p_request_id,v_hash)
 ON CONFLICT(teacher_id,request_id) DO NOTHING RETURNING id INTO v_material;
 IF v_material IS NULL THEN
   SELECT * INTO v_previous FROM public.learning_materials
     WHERE teacher_id=v_teacher AND request_id=p_request_id;
   IF v_previous.id IS NULL OR v_previous.request_hash <> v_hash
     THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('id',v_previous.id,'kind',v_previous.kind,'title',v_previous.title,'replayed',true);
 END IF;
 IF p_kind='game' THEN
   IF char_length(btrim(coalesce(p_details->>'pgn',''))) NOT BETWEEN 1 AND 150000
      OR coalesce(p_details->>'result','*') NOT IN ('1-0','0-1','1/2-1/2','*')
      THEN RAISE EXCEPTION 'INVALID_GAME'; END IF;
   INSERT INTO public.chess_games(material_id,teacher_id,pgn,white_player,black_player,result)
    VALUES(v_material,v_teacher,p_details->>'pgn',coalesce(p_details->>'whitePlayer',''),
           coalesce(p_details->>'blackPlayer',''),coalesce(p_details->>'result','*'));
 ELSIF p_kind='puzzle' THEN
   IF char_length(btrim(coalesce(p_details->>'fen',''))) NOT BETWEEN 15 AND 150
      OR jsonb_typeof(coalesce(p_details->'themes','[]'::jsonb))<>'array'
      THEN RAISE EXCEPTION 'INVALID_PUZZLE'; END IF;
   INSERT INTO public.chess_puzzles(material_id,teacher_id,fen,solution,themes)
    VALUES(v_material,v_teacher,p_details->>'fen',p_details->>'solution',
           COALESCE(ARRAY(SELECT jsonb_array_elements_text(coalesce(p_details->'themes','[]'::jsonb))),ARRAY[]::text[]));
 ELSIF p_kind='drill' THEN
   IF char_length(btrim(coalesce(p_details->>'instructions',''))) NOT BETWEEN 1 AND 5000
      THEN RAISE EXCEPTION 'INVALID_DRILL'; END IF;
   INSERT INTO public.chess_drills(material_id,teacher_id,instructions,mode,repetitions)
    VALUES(v_material,v_teacher,p_details->>'instructions',
      coalesce(p_details->>'mode','other'),(p_details->>'repetitions')::integer);
 ELSIF p_kind='study_chapter' THEN
   IF p_source_url IS NULL OR
      char_length(btrim(coalesce(p_details->>'studyId',''))) NOT BETWEEN 1 AND 128
      THEN RAISE EXCEPTION 'INVALID_CHAPTER'; END IF;
   INSERT INTO public.chess_study_chapters(material_id,teacher_id,provider,study_id,chapter_id)
    VALUES(v_material,v_teacher,coalesce(p_details->>'provider','lichess'),
      p_details->>'studyId',nullif(p_details->>'chapterId',''));
 ELSE
   IF p_source_url IS NULL OR p_details <> '{}'::jsonb THEN RAISE EXCEPTION 'INVALID_LINK'; END IF;
 END IF;
 RETURN jsonb_build_object('id',v_material,'kind',p_kind,'title',btrim(p_title),'replayed',false);
END;
$ccp$;
REVOKE ALL ON FUNCTION public.ccp_material_catalog_create(text,text,text,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_material_catalog_create(text,text,text,text,jsonb,uuid) TO authenticated;
-- END ChessCoachPal typed learning materials.



-- BEGIN teacher-recorded chess homework: assignments, attempts and reviews.
-- All three are distinct evidence events; completion never means mastery.
CREATE TABLE public.training_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 student_id uuid NOT NULL,
 material_id uuid NOT NULL,
 instructions text NOT NULL DEFAULT '' CHECK (char_length(instructions) <= 5000),
 due_on date,
 batch_request_id uuid NOT NULL,
 request_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(teacher_id,id),
 UNIQUE(teacher_id,batch_request_id,student_id),
 FOREIGN KEY(student_id,teacher_id) REFERENCES public.students(id,teacher_id),
 FOREIGN KEY(teacher_id,material_id) REFERENCES public.learning_materials(teacher_id,id)
);
CREATE INDEX training_assignments_student_idx ON public.training_assignments
 (teacher_id,student_id,created_at DESC);

CREATE TABLE public.assignment_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 assignment_id uuid NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('in_progress','submitted','completed')),
 note text NOT NULL DEFAULT '' CHECK(char_length(note) <= 5000),
 source text NOT NULL DEFAULT 'teacher_manual' CHECK(source='teacher_manual'),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 request_id uuid NOT NULL,
 request_hash text NOT NULL,
 UNIQUE(teacher_id,id),
 UNIQUE(teacher_id,request_id),
 FOREIGN KEY(teacher_id,assignment_id) REFERENCES public.training_assignments(teacher_id,id)
);
CREATE TABLE public.assignment_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 assignment_id uuid NOT NULL,
 attempt_id uuid,
 verdict text NOT NULL CHECK(verdict IN ('reviewed','needs_work')),
 feedback text NOT NULL DEFAULT '' CHECK(char_length(feedback) <= 5000),
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 request_id uuid NOT NULL,
 request_hash text NOT NULL,
 UNIQUE(teacher_id,id),
 UNIQUE(teacher_id,request_id),
 FOREIGN KEY(teacher_id,assignment_id) REFERENCES public.training_assignments(teacher_id,id),
 FOREIGN KEY(teacher_id,attempt_id) REFERENCES public.assignment_attempts(teacher_id,id)
);
ALTER TABLE public.training_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY training_assignments_owner ON public.training_assignments
 FOR ALL TO authenticated USING(teacher_id=auth.uid()) WITH CHECK(teacher_id=auth.uid());
CREATE POLICY assignment_attempts_owner ON public.assignment_attempts
 FOR ALL TO authenticated USING(teacher_id=auth.uid()) WITH CHECK(teacher_id=auth.uid());
CREATE POLICY assignment_reviews_owner ON public.assignment_reviews
 FOR ALL TO authenticated USING(teacher_id=auth.uid()) WITH CHECK(teacher_id=auth.uid());
GRANT SELECT ON public.training_assignments,public.assignment_attempts,public.assignment_reviews TO authenticated;
GRANT ALL ON public.training_assignments,public.assignment_attempts,public.assignment_reviews TO service_role;

-- One request can fan out to several students. One database transaction means
-- either every authorized student gets an assignment or none do.
CREATE FUNCTION public.ccp_assign_material(
 p_student_ids uuid[],p_material_id uuid,p_instructions text,p_due_on date,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $ccp_assign$
DECLARE
 v_teacher uuid := auth.uid(); v_student uuid; v_id uuid;
 v_sorted uuid[]; v_hash text; v_prior text; v_ids uuid[] := ARRAY[]::uuid[];
 v_created integer := 0;
BEGIN
 IF v_teacher IS NULL OR p_request_id IS NULL OR p_material_id IS NULL OR
    cardinality(p_student_ids) NOT BETWEEN 1 AND 100 OR
    char_length(coalesce(p_instructions,''))>5000 THEN
   RAISE EXCEPTION 'VALIDATION_ERROR';
 END IF;
 SELECT array_agg(s ORDER BY s) INTO v_sorted FROM unnest(p_student_ids) AS all_ids(s);
 IF cardinality(v_sorted) <> (SELECT count(DISTINCT s) FROM unnest(v_sorted) AS ids(s)) THEN
   RAISE EXCEPTION 'DUPLICATE_STUDENTS';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.learning_materials
      WHERE id=p_material_id AND teacher_id=v_teacher) OR
    (SELECT count(*) FROM public.students
      WHERE id=ANY(v_sorted) AND teacher_id=v_teacher AND archived_at IS NULL) <> cardinality(v_sorted)
 THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 v_hash := md5(jsonb_build_array(v_sorted,p_material_id,coalesce(p_instructions,''),p_due_on)::text);
 SELECT request_hash INTO v_prior FROM public.training_assignments
    WHERE teacher_id=v_teacher AND batch_request_id=p_request_id LIMIT 1;
 IF v_prior IS NOT NULL AND v_prior <> v_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 FOREACH v_student IN ARRAY v_sorted LOOP
   v_id := NULL;
   INSERT INTO public.training_assignments
     (teacher_id,student_id,material_id,instructions,due_on,batch_request_id,request_hash)
   VALUES(v_teacher,v_student,p_material_id,coalesce(p_instructions,''),p_due_on,p_request_id,v_hash)
   ON CONFLICT(teacher_id,batch_request_id,student_id) DO NOTHING RETURNING id INTO v_id;
   IF v_id IS NULL THEN
     SELECT id INTO v_id FROM public.training_assignments
       WHERE teacher_id=v_teacher AND batch_request_id=p_request_id AND student_id=v_student
         AND request_hash=v_hash;
     IF v_id IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   ELSE
     v_created := v_created+1;
   END IF;
   v_ids := array_append(v_ids,v_id);
 END LOOP;
 RETURN jsonb_build_object('assignmentIds',v_ids,'replayed',v_created=0,'studentCount',cardinality(v_ids));
END;
$ccp_assign$;

CREATE FUNCTION public.ccp_assignment_record_attempt(
 p_assignment_id uuid,p_outcome text,p_note text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $ccp_attempt$
DECLARE
 v_teacher uuid:=auth.uid();v_id uuid;v_hash text;v_previous public.assignment_attempts%ROWTYPE;
BEGIN
 IF v_teacher IS NULL OR p_request_id IS NULL OR p_outcome NOT IN ('in_progress','submitted','completed')
    OR char_length(coalesce(p_note,''))>5000 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.training_assignments
   WHERE teacher_id=v_teacher AND id=p_assignment_id) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 v_hash:=md5(jsonb_build_array(p_assignment_id,p_outcome,coalesce(p_note,''))::text);
 INSERT INTO public.assignment_attempts(teacher_id,assignment_id,outcome,note,request_id,request_hash)
 VALUES(v_teacher,p_assignment_id,p_outcome,coalesce(p_note,''),p_request_id,v_hash)
 ON CONFLICT(teacher_id,request_id) DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NULL THEN
   SELECT * INTO v_previous FROM public.assignment_attempts
    WHERE teacher_id=v_teacher AND request_id=p_request_id;
   IF v_previous.id IS NULL OR v_previous.request_hash<>v_hash
     THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('attemptId',v_previous.id,'replayed',true);
 END IF;
 RETURN jsonb_build_object('attemptId',v_id,'replayed',false);
END;
$ccp_attempt$;

CREATE FUNCTION public.ccp_assignment_record_review(
 p_assignment_id uuid,p_attempt_id uuid,p_verdict text,p_feedback text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $ccp_review$
DECLARE
 v_teacher uuid:=auth.uid();v_id uuid;v_hash text;v_previous public.assignment_reviews%ROWTYPE;
BEGIN
 IF v_teacher IS NULL OR p_request_id IS NULL OR p_verdict NOT IN ('reviewed','needs_work')
    OR char_length(coalesce(p_feedback,''))>5000 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.training_assignments
   WHERE teacher_id=v_teacher AND id=p_assignment_id) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF p_attempt_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.assignment_attempts WHERE teacher_id=v_teacher
    AND id=p_attempt_id AND assignment_id=p_assignment_id)
 THEN RAISE EXCEPTION 'ATTEMPT_MISMATCH'; END IF;
 v_hash:=md5(jsonb_build_array(p_assignment_id,p_attempt_id,p_verdict,coalesce(p_feedback,''))::text);
 INSERT INTO public.assignment_reviews(teacher_id,assignment_id,attempt_id,verdict,feedback,request_id,request_hash)
 VALUES(v_teacher,p_assignment_id,p_attempt_id,p_verdict,coalesce(p_feedback,''),p_request_id,v_hash)
 ON CONFLICT(teacher_id,request_id) DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NULL THEN
   SELECT * INTO v_previous FROM public.assignment_reviews
    WHERE teacher_id=v_teacher AND request_id=p_request_id;
   IF v_previous.id IS NULL OR v_previous.request_hash<>v_hash
     THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('reviewId',v_previous.id,'replayed',true);
 END IF;
 RETURN jsonb_build_object('reviewId',v_id,'replayed',false);
END;
$ccp_review$;
REVOKE ALL ON FUNCTION public.ccp_assign_material(uuid[],uuid,text,date,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ccp_assignment_record_attempt(uuid,text,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ccp_assignment_record_review(uuid,uuid,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_assign_material(uuid[],uuid,text,date,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ccp_assignment_record_attempt(uuid,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ccp_assignment_record_review(uuid,uuid,text,text,uuid) TO authenticated;
-- END chess homework core.

-- New pre-1.0 fresh-stack migration. Agent writes are atomic, tenant-scoped and replay-safe.
-- No old-schema or CogNote compatibility contract is provided.
ALTER TABLE public.workplaces ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.class_groups ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.ccp_touch_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER ccp_workplaces_revision BEFORE UPDATE ON public.workplaces
FOR EACH ROW EXECUTE FUNCTION public.ccp_touch_revision();
CREATE TRIGGER ccp_students_revision BEFORE UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.ccp_touch_revision();
CREATE TRIGGER ccp_groups_revision BEFORE UPDATE ON public.class_groups
FOR EACH ROW EXECUTE FUNCTION public.ccp_touch_revision();

-- Allow application writers to see revisions so web and MCP edits share one lock version.
-- The RPC uses auth.uid() from the end-user JWT and explicitly owner-scopes every query.
-- SECURITY DEFINER is needed only because receipt storage is never directly
-- accessible to authenticated clients. Never allow a caller-provided teacher ID.
CREATE OR REPLACE FUNCTION public.agent_coaching_mutate(
  p_operation text,
  p_payload jsonb,
  p_expected_updated_at timestamptz,
  p_idempotency_key uuid,
  p_client_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_teacher uuid := auth.uid();
  v_hash text;
  v_saved public.agent_tool_receipts%ROWTYPE;
  v_receipt jsonb;
  v_id uuid;
  v_workplace uuid;
  v_student uuid;
  v_group uuid;
  v_start timestamptz;
  v_duration integer;
  v_revision timestamptz;
  v_existing_status text;
BEGIN
  IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_idempotency_key IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR p_client_id IS NULL OR length(p_client_id) > 200 OR length(p_client_id) < 1 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR';
  END IF;
  IF p_operation NOT IN (
    'workplaces.create','workplaces.update','workplaces.enroll',
    'students.create','students.update','groups.create','groups.update',
    'groups.enroll','groups.unenroll','sessions.create','sessions.reschedule','sessions.cancel'
  ) THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  IF p_operation IN ('workplaces.update','students.update','groups.update',
                     'sessions.reschedule','sessions.cancel')
     AND p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  IF p_operation NOT IN ('workplaces.update','students.update','groups.update',
                         'sessions.reschedule','sessions.cancel')
     AND p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;

  -- The unique (teacher_id, idempotency_key) row lock serializes racing retries.
  -- The entire transaction rolls back on validation/conflict/permission failures.
  -- Browser and delegated MCP use ONE request identity. Client ID is audit
  -- provenance, not a distinguishing field in the logical business request:
  -- otherwise a retry of the same approved UUID across surfaces conflicts.
  v_hash := md5(jsonb_build_array(p_operation,p_payload,p_expected_updated_at)::text);
  INSERT INTO public.agent_tool_receipts(teacher_id,idempotency_key,operation,request_hash,receipt)
  VALUES(v_teacher,p_idempotency_key,p_operation,v_hash,'{}'::jsonb)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO v_saved FROM public.agent_tool_receipts
    WHERE teacher_id = v_teacher AND idempotency_key = p_idempotency_key;
    IF NOT FOUND OR v_saved.operation <> p_operation OR v_saved.request_hash <> v_hash
    THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    RETURN v_saved.receipt;
  END IF;

  IF p_operation = 'workplaces.create' THEN
    INSERT INTO public.workplaces(teacher_id,name,timezone,currency,locale,policy)
    VALUES(v_teacher,p_payload->>'name',p_payload->>'timezone',p_payload->>'currency',
           p_payload->>'locale',p_payload->'policy')
    RETURNING id,updated_at INTO v_id,v_revision;

  ELSIF p_operation = 'workplaces.update' THEN
    UPDATE public.workplaces SET
      name = COALESCE(p_payload->>'name',name),
      timezone = COALESCE(p_payload->>'timezone',timezone),
      currency = COALESCE(p_payload->>'currency',currency),
      locale = COALESCE(p_payload->>'locale',locale),
      policy = COALESCE(p_payload->'policy',policy)
    WHERE id = (p_payload->>'workplaceId')::uuid AND teacher_id = v_teacher
      AND updated_at = p_expected_updated_at
    RETURNING id,updated_at INTO v_id,v_revision;
    IF NOT FOUND THEN RAISE EXCEPTION 'CONFLICT_OR_NOT_FOUND'; END IF;

  ELSIF p_operation = 'students.create' THEN
    INSERT INTO public.students(teacher_id,name,level)
    VALUES(v_teacher,p_payload->>'name',p_payload->>'level')
    RETURNING id,updated_at INTO v_id,v_revision;

  ELSIF p_operation = 'students.update' THEN
    UPDATE public.students SET
      name = COALESCE(p_payload->>'name',name),
      level = CASE WHEN p_payload ? 'level' THEN p_payload->>'level' ELSE level END
    WHERE id = (p_payload->>'studentId')::uuid AND teacher_id = v_teacher
      AND archived_at IS NULL AND updated_at = p_expected_updated_at
    RETURNING id,updated_at INTO v_id,v_revision;
    IF NOT FOUND THEN RAISE EXCEPTION 'CONFLICT_OR_NOT_FOUND'; END IF;

  ELSIF p_operation = 'workplaces.enroll' THEN
    v_workplace := (p_payload->>'workplaceId')::uuid;
    v_student := (p_payload->>'studentId')::uuid;
    PERFORM 1 FROM public.workplaces WHERE id=v_workplace AND teacher_id=v_teacher;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    PERFORM 1 FROM public.students WHERE id=v_student AND teacher_id=v_teacher AND archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    INSERT INTO public.workplace_enrollments(teacher_id,workplace_id,student_id)
    VALUES(v_teacher,v_workplace,v_student) ON CONFLICT DO NOTHING;
    v_id := v_student;

  ELSIF p_operation = 'groups.create' THEN
    v_workplace := (p_payload->>'workplaceId')::uuid;
    PERFORM 1 FROM public.workplaces WHERE id=v_workplace AND teacher_id=v_teacher;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    INSERT INTO public.class_groups(teacher_id,workplace_id,name)
    VALUES(v_teacher,v_workplace,p_payload->>'name')
    RETURNING id,updated_at INTO v_id,v_revision;

  ELSIF p_operation = 'groups.update' THEN
    UPDATE public.class_groups SET name = p_payload->>'name'
    WHERE id=(p_payload->>'groupId')::uuid AND teacher_id=v_teacher
      AND workplace_id=(p_payload->>'workplaceId')::uuid
      AND updated_at=p_expected_updated_at
    RETURNING id,updated_at INTO v_id,v_revision;
    IF NOT FOUND THEN RAISE EXCEPTION 'CONFLICT_OR_NOT_FOUND'; END IF;

  ELSIF p_operation IN ('groups.enroll','groups.unenroll') THEN
    v_group := (p_payload->>'groupId')::uuid;
    v_student := (p_payload->>'studentId')::uuid;
    SELECT workplace_id INTO v_workplace FROM public.class_groups
    WHERE id=v_group AND teacher_id=v_teacher;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    PERFORM 1 FROM public.students WHERE id=v_student AND teacher_id=v_teacher AND archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF p_operation = 'groups.enroll' THEN
      INSERT INTO public.workplace_enrollments(teacher_id,workplace_id,student_id)
      VALUES(v_teacher,v_workplace,v_student) ON CONFLICT DO NOTHING;
      INSERT INTO public.group_enrollments(teacher_id,group_id,workplace_id,student_id)
      VALUES(v_teacher,v_group,v_workplace,v_student) ON CONFLICT DO NOTHING;
    ELSE
      DELETE FROM public.group_enrollments
      WHERE teacher_id=v_teacher AND group_id=v_group AND student_id=v_student;
      IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    END IF;
    v_id := v_group;

  ELSIF p_operation = 'sessions.create' THEN
    v_workplace := (p_payload->>'workplaceId')::uuid;
    v_group := NULLIF(p_payload->>'groupId','')::uuid;
    v_student := NULLIF(p_payload->>'studentId','')::uuid;
    IF (v_group IS NULL) = (v_student IS NULL) THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
    SELECT id INTO v_id FROM public.workplaces WHERE id=v_workplace AND teacher_id=v_teacher;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF v_group IS NOT NULL THEN
      PERFORM 1 FROM public.class_groups WHERE id=v_group AND workplace_id=v_workplace
        AND teacher_id=v_teacher;
    ELSE
      PERFORM 1 FROM public.workplace_enrollments WHERE workplace_id=v_workplace
        AND student_id=v_student AND teacher_id=v_teacher;
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    v_start := (p_payload->>'startsAt')::timestamptz;
    v_duration := (p_payload->>'durationMinutes')::integer;
    IF v_start IS NULL OR v_duration NOT BETWEEN 15 AND 480 THEN
      RAISE EXCEPTION 'VALIDATION_ERROR';
    END IF;
    -- Serializes MCP-created sessions for the same teacher, preventing MCP/MCP overlap races.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_teacher::text,0));
    IF EXISTS (
      SELECT 1 FROM public.teaching_sessions s
      WHERE s.teacher_id=v_teacher AND s.status <> 'cancelled'
        AND tstzrange(s.starts_at, s.starts_at+s.duration_minutes*interval '1 minute','[)')
          && tstzrange(v_start,v_start+v_duration*interval '1 minute','[)')
    ) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    INSERT INTO public.teaching_sessions(
      teacher_id,workplace_id,group_id,student_id,title,starts_at,
      duration_minutes,lesson_note,request_id)
    VALUES(v_teacher,v_workplace,v_group,v_student,p_payload->>'title',v_start,
           v_duration,COALESCE(p_payload->>'lessonNote',''),p_idempotency_key)
    RETURNING id,updated_at INTO v_id,v_revision;

  ELSIF p_operation IN ('sessions.reschedule','sessions.cancel') THEN
    v_id := (p_payload->>'sessionId')::uuid;
    -- Block concurrent MCP writes while evaluating the new time interval.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_teacher::text,0));
    SELECT status,starts_at,duration_minutes INTO v_existing_status,v_start,v_duration
    FROM public.teaching_sessions
    WHERE id=v_id AND teacher_id=v_teacher AND updated_at=p_expected_updated_at
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CONFLICT_OR_NOT_FOUND'; END IF;
    IF v_existing_status <> 'scheduled' THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    IF p_operation = 'sessions.reschedule' THEN
      v_start := (p_payload->>'startsAt')::timestamptz;
      v_duration := (p_payload->>'durationMinutes')::integer;
      IF v_start IS NULL OR v_duration NOT BETWEEN 15 AND 480 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.teaching_sessions s
        WHERE s.teacher_id=v_teacher AND s.id <> v_id AND s.status <> 'cancelled'
          AND tstzrange(s.starts_at,s.starts_at+s.duration_minutes*interval '1 minute','[)')
            && tstzrange(v_start,v_start+v_duration*interval '1 minute','[)')
      ) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
      UPDATE public.teaching_sessions SET starts_at=v_start,duration_minutes=v_duration,
        updated_at=clock_timestamp() WHERE id=v_id AND teacher_id=v_teacher
      RETURNING updated_at INTO v_revision;
    ELSE
      UPDATE public.teaching_sessions SET status='cancelled',updated_at=clock_timestamp()
      WHERE id=v_id AND teacher_id=v_teacher RETURNING updated_at INTO v_revision;
    END IF;
  END IF;

  -- Never persist notes, student names, OAuth credentials or arbitrary payloads in receipts.
  v_receipt := jsonb_build_object('operation',p_operation,'entityId',v_id,
    'revision',v_revision,'timestamp',clock_timestamp(),
    'actorId',v_teacher,'clientId',p_client_id,'idempotencyKey',p_idempotency_key);
  UPDATE public.agent_tool_receipts SET receipt=v_receipt
  WHERE teacher_id=v_teacher AND idempotency_key=p_idempotency_key;
  RETURN v_receipt;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_coaching_mutate(text,jsonb,timestamptz,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agent_coaching_mutate(text,jsonb,timestamptz,uuid,text) TO authenticated;

-- Harden inherited default grants before exposing the v0.x OAuth/MCP
-- service on a public HTTPS demo domain. The canonical fresh-install schema
-- grants future function EXECUTE directly to anon; revoking only from PUBLIC
-- is insufficient. Authenticated teacher-scoped agent calls remain supported.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION
  public.agent_coaching_mutate(text,jsonb,timestamptz,uuid,text)
  FROM PUBLIC, anon;
-- This function runs exclusively as a trigger and is not a public API.
REVOKE EXECUTE ON FUNCTION
  public.chesscoachpal_snapshot_participants()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.agent_coaching_mutate(text,jsonb,timestamptz,uuid,text)
  TO authenticated;
DO $privileges$
DECLARE
  func regprocedure;
BEGIN
  FOREACH func IN ARRAY ARRAY[
    'public.agent_coaching_mutate(text,jsonb,timestamptz,uuid,text)'::regprocedure,
    'public.chesscoachpal_snapshot_participants()'::regprocedure
  ] LOOP
    IF has_function_privilege('anon',func,'EXECUTE') THEN
      RAISE EXCEPTION 'Anonymous EXECUTE must be revoked on %',func;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('authenticated',
       'public.agent_coaching_mutate(text,jsonb,timestamptz,uuid,text)'::regprocedure,
       'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated coaching mutations must remain permitted';
  END IF;
END;
$privileges$;

-- Teacher-owned chess student profile. All values are teacher-entered; no provider rating verification is implied.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS name_aliases text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS strength smallint,
  ADD COLUMN IF NOT EXISTS lichess_username text,
  ADD COLUMN IF NOT EXISTS chesscom_username text,
  ADD COLUMN IF NOT EXISTS lichess_rating integer,
  ADD COLUMN IF NOT EXISTS chesscom_rating integer;
ALTER TABLE public.students
  ADD CONSTRAINT ccp_students_strength_range CHECK (strength IS NULL OR strength BETWEEN 1 AND 10),
  ADD CONSTRAINT ccp_students_lichess_rating_range CHECK (lichess_rating IS NULL OR lichess_rating BETWEEN 100 AND 4000),
  ADD CONSTRAINT ccp_students_chesscom_rating_range CHECK (chesscom_rating IS NULL OR chesscom_rating BETWEEN 100 AND 4000),
  ADD CONSTRAINT ccp_students_alias_limit CHECK (cardinality(name_aliases) <= 20);
-- A searchable derived field keeps multilingual names and aliases in the same roster query.
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS name_search text NOT NULL DEFAULT '';
CREATE OR REPLACE FUNCTION public.ccp_student_search_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  NEW.name_search := lower(NEW.name || ' ' || array_to_string(NEW.name_aliases, ' '));
  RETURN NEW;
END;
$$;
CREATE TRIGGER ccp_student_search_refresh
BEFORE INSERT OR UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.ccp_student_search_refresh();
UPDATE public.students SET name_search = lower(name || ' ' || array_to_string(name_aliases, ' '));
CREATE INDEX IF NOT EXISTS ccp_students_teacher_active_name ON public.students(teacher_id, archived_at, name);

-- Direct owner-scoped student removals must never cascade linked teaching records.
-- The API's deletion impact preview is advisory; the final safety check belongs
-- in the DELETE transaction, after PostgreSQL acquires the student row lock.
-- auth.uid() is empty for privileged migration/maintenance cleanup and those
-- administrator operations retain their existing explicit retention procedures.
CREATE OR REPLACE FUNCTION public.ccp_restrict_student_history_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN OLD;
  END IF;
  IF auth.uid() <> OLD.teacher_id THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lessons WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.lesson_slots WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.teaching_sessions WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.session_participants WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.group_enrollments WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.workplace_enrollments WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.skill_assessments WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.material_links WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.chess_observations WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.material_teaching_evidence WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.event_students WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.credit_packages WHERE student_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'HISTORY_DEPENDENCIES'
      USING ERRCODE = '23503',
            DETAIL = 'Archive the student instead of erasing linked records.';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.ccp_restrict_student_history_delete() FROM PUBLIC;
DROP TRIGGER IF EXISTS ccp_restrict_student_history_delete ON public.students;
CREATE TRIGGER ccp_restrict_student_history_delete
BEFORE DELETE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.ccp_restrict_student_history_delete();

-- The workplace/student enrollment is the parent FK for live group membership.
-- PostgreSQL currently cascades group enrollment deletion when this membership is
-- deleted. That must never happen silently from a teacher-facing unenroll.
CREATE OR REPLACE FUNCTION public.ccp_restrict_workplace_unenroll()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  -- Privileged maintenance/account teardown runs through a distinct pathway.
  IF auth.uid() IS NULL THEN
    RETURN OLD;
  END IF;
  IF auth.uid() <> OLD.teacher_id THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.group_enrollments
    WHERE teacher_id=OLD.teacher_id AND workplace_id=OLD.workplace_id
      AND student_id=OLD.student_id
  ) THEN
    RAISE EXCEPTION 'ACTIVE_GROUP_MEMBERSHIP' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.teaching_sessions
    WHERE teacher_id=OLD.teacher_id AND workplace_id=OLD.workplace_id
      AND student_id=OLD.student_id AND status='scheduled'
      AND starts_at >= now()
  ) THEN
    RAISE EXCEPTION 'FUTURE_COMMITMENTS' USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_restrict_workplace_unenroll() FROM PUBLIC;
DROP TRIGGER IF EXISTS ccp_restrict_workplace_unenroll ON public.workplace_enrollments;
CREATE TRIGGER ccp_restrict_workplace_unenroll
BEFORE DELETE ON public.workplace_enrollments
FOR EACH ROW EXECUTE FUNCTION public.ccp_restrict_workplace_unenroll();

-- Enforce active student quotas at the only race-safe boundary: the database.
-- A locked teacher row serializes all insert/archive/unarchive/delete transactions.
-- Tenant entitlements and counters are changed by trusted server provisioning.
ALTER TABLE public.teachers
 ADD COLUMN hosted_enforced boolean NOT NULL DEFAULT false,
 ADD COLUMN hosted_max_active_students integer NOT NULL DEFAULT 5,
 ADD COLUMN active_student_count integer NOT NULL DEFAULT 0,
 ADD CONSTRAINT ccp_hosted_capacity_range CHECK(hosted_max_active_students BETWEEN 1 AND 1000000),
 ADD CONSTRAINT ccp_active_students_nonnegative CHECK(active_student_count>=0);
UPDATE public.teachers t SET active_student_count=(
 SELECT count(*) FROM public.students s WHERE s.teacher_id=t.id AND s.archived_at IS NULL
);
UPDATE public.teachers SET hosted_enforced=true
 WHERE hosted_plan IN ('trial','pro','founding','gifted');
-- The existing migration grants only safe teacher-profile columns to authenticated.
-- Restate that security invariant so raw PostgREST requests cannot falsify caps.
REVOKE UPDATE ON TABLE public.teachers FROM PUBLIC,anon,authenticated;
GRANT UPDATE(email,display_name,avatar_url,onboarding_tour_completed_at,calendar_token)
 ON TABLE public.teachers TO authenticated;

CREATE OR REPLACE FUNCTION public.ccp_student_capacity_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE
 v_teacher uuid; v_delta integer:=0; v_count integer; v_max integer;
 v_hosted boolean; v_plan text; v_trial timestamptz; v_gift timestamptz;
BEGIN
 IF TG_OP='INSERT' THEN
   v_teacher:=NEW.teacher_id;
   IF NEW.archived_at IS NULL THEN v_delta:=1; END IF;
 ELSIF TG_OP='DELETE' THEN
   v_teacher:=OLD.teacher_id;
   IF OLD.archived_at IS NULL THEN v_delta:=-1; END IF;
 ELSE
   IF NEW.teacher_id IS DISTINCT FROM OLD.teacher_id THEN
     RAISE EXCEPTION 'STUDENT_OWNER_IMMUTABLE' USING ERRCODE='23514';
   END IF;
   v_teacher:=NEW.teacher_id;
   IF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN
     v_delta:=1;
   ELSIF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
     v_delta:=-1;
     IF EXISTS(SELECT 1 FROM public.lesson_slots
               WHERE teacher_id=v_teacher AND student_id=NEW.id AND active)
       OR EXISTS(SELECT 1 FROM public.lessons
               WHERE teacher_id=v_teacher AND student_id=NEW.id
                 AND starts_at>=clock_timestamp())
       OR EXISTS(SELECT 1 FROM public.teaching_sessions
               WHERE teacher_id=v_teacher AND student_id=NEW.id
                 AND status='scheduled' AND starts_at>=clock_timestamp())
       OR EXISTS(SELECT 1 FROM public.session_participants sp
                 JOIN public.teaching_sessions sess ON sess.id=sp.session_id
               WHERE sp.teacher_id=v_teacher AND sp.student_id=NEW.id
                 AND sess.status='scheduled' AND sess.starts_at>=clock_timestamp())
       OR EXISTS(SELECT 1 FROM public.group_enrollments
               WHERE teacher_id=v_teacher AND student_id=NEW.id) THEN
       RAISE EXCEPTION 'FUTURE_COMMITMENTS' USING ERRCODE='23503';
     END IF;
   END IF;
 END IF;
 IF v_delta<>0 THEN
   SELECT active_student_count,hosted_max_active_students,hosted_enforced,
          hosted_plan,trial_ends_at,gifted_until
   INTO v_count,v_max,v_hosted,v_plan,v_trial,v_gift
   FROM public.teachers WHERE id=v_teacher FOR UPDATE;
   IF FOUND THEN
     IF v_delta>0 AND v_hosted AND
       (v_plan='free'
        OR (v_plan='trial' AND (v_trial IS NULL OR v_trial<=clock_timestamp()))
        OR (v_plan='gifted' AND (v_gift IS NULL OR v_gift<=clock_timestamp())))
        AND v_count+v_delta>v_max THEN
       RAISE EXCEPTION 'HOSTED_LIMIT_REACHED' USING ERRCODE='23514';
     END IF;
     UPDATE public.teachers SET active_student_count=active_student_count+v_delta
       WHERE id=v_teacher;
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_student_capacity_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS ccp_student_capacity_guard ON public.students;
CREATE TRIGGER ccp_student_capacity_guard
 BEFORE INSERT OR UPDATE OR DELETE ON public.students
 FOR EACH ROW EXECUTE FUNCTION public.ccp_student_capacity_guard();

-- No teacher client may edit hosted_plan; the one permitted demotion is a
-- server-verified, owner-only function with expired entitlement preconditions.
CREATE OR REPLACE FUNCTION public.ccp_demote_expired_hosted_plan()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE v_teacher uuid:=auth.uid();
BEGIN
 IF v_teacher IS NULL THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
 END IF;
 UPDATE public.teachers SET hosted_plan='free'
 WHERE id=v_teacher AND hosted_enforced=true AND (
   (hosted_plan='trial' AND (trial_ends_at IS NULL OR trial_ends_at<=clock_timestamp()))
   OR (hosted_plan='gifted' AND (gifted_until IS NULL OR gifted_until<=clock_timestamp()))
 );
 RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_demote_expired_hosted_plan() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_demote_expired_hosted_plan() TO authenticated;

-- One authenticated RPC transaction for spreadsheet onboarding, including
-- family creation, deduplication, quota reservations, and durable replay receipt.
-- A rejected row or hosted-cap conflict rolls back every student/family/receipt.
CREATE TABLE public.teacher_spreadsheet_import_receipts (
 teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
 idempotency_key uuid NOT NULL,
 request_hash text NOT NULL,
 receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(teacher_id,idempotency_key)
);
ALTER TABLE public.teacher_spreadsheet_import_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teacher_spreadsheet_import_receipts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.teacher_spreadsheet_import_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.ccp_teacher_spreadsheet_commit(
 p_rows jsonb, p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE
 v_teacher uuid:=auth.uid();
 v_row jsonb; v_digest text; v_saved public.teacher_spreadsheet_import_receipts%ROWTYPE;
 v_names jsonb:='{}'::jsonb; v_group_ids jsonb:='{}'::jsonb;
 v_name text; v_key text; v_email text; v_guardian uuid; v_parent text;
 v_created integer:=0; v_skipped integer:=0; v_families integer:=0;
 v_skipped_rows jsonb:='[]'::jsonb; v_result jsonb;
 v_row_number integer;
BEGIN
 IF v_teacher IS NULL THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
 END IF;
 IF p_idempotency_key IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 THEN
   RAISE EXCEPTION 'IMPORT_VALIDATION_ERROR' USING ERRCODE='22023';
 END IF;
 -- Lock once for the entire batch. The per-student quota trigger obtains this
 -- same lock and therefore cannot race with another import or a direct create.
 PERFORM 1 FROM public.teachers WHERE id=v_teacher FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 v_digest:=md5(p_rows::text);
 INSERT INTO public.teacher_spreadsheet_import_receipts
    (teacher_id,idempotency_key,request_hash,receipt)
 VALUES(v_teacher,p_idempotency_key,v_digest,'{}'::jsonb)
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN
   SELECT * INTO v_saved FROM public.teacher_spreadsheet_import_receipts
   WHERE teacher_id=v_teacher AND idempotency_key=p_idempotency_key;
   IF NOT FOUND OR v_saved.request_hash<>v_digest THEN
     RAISE EXCEPTION 'IMPORT_REPLAY_CONFLICT' USING ERRCODE='23505';
   END IF;
   RETURN v_saved.receipt;
 END IF;

 FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
   v_name:=btrim(v_row->>'studentName');
   v_key:=v_row->>'familyKey';
   v_row_number:=(v_row->>'sourceRow')::integer;
   IF jsonb_typeof(v_row)<>'object' OR v_name IS NULL
      OR length(v_name) NOT BETWEEN 1 AND 200
      OR v_key IS NULL OR length(v_key) NOT BETWEEN 1 AND 320
      OR v_row_number NOT BETWEEN 1 AND 1000000
      OR length(coalesce(v_row->>'teacherNotes',''))>50000
      OR length(coalesce(v_row->>'guardianName',''))>200 THEN
     RAISE EXCEPTION 'IMPORT_VALIDATION_ERROR' USING ERRCODE='22023';
   END IF;
   -- Historical/archived student names are preserved, not recreated.
   -- Holding the teacher lock makes this check consistent with other imports.
   IF EXISTS(SELECT 1 FROM public.students
     WHERE teacher_id=v_teacher AND lower(btrim(name))=lower(v_name)) THEN
     v_skipped:=v_skipped+1;
     IF jsonb_array_length(v_skipped_rows)<50 THEN
       v_skipped_rows:=v_skipped_rows||jsonb_build_array(
         jsonb_build_object('row',v_row_number,'reason','Student already exists'));
     END IF;
     CONTINUE;
   END IF;

   v_guardian:=NULL;
   IF v_group_ids ? v_key THEN
     v_guardian:=(v_group_ids->>v_key)::uuid;
   ELSE
     v_email:=lower(nullif(btrim(v_row->>'email'),''));
     IF v_email IS NOT NULL THEN
       SELECT id INTO v_guardian FROM public.guardians
       WHERE teacher_id=v_teacher AND lower(btrim(email))=v_email
       ORDER BY created_at,id LIMIT 1;
     END IF;
     IF v_guardian IS NULL THEN
       v_parent:=coalesce(nullif(btrim(v_row->>'guardianName'),''),
           nullif(btrim(v_row->>'familyName'),''),
           CASE WHEN v_email IS NOT NULL
              OR nullif(btrim(v_row->>'phone'),'') IS NOT NULL
             THEN 'Parent of '||v_name ELSE v_name END);
       INSERT INTO public.guardians(
         teacher_id,name,family_name,email,phone,
         secondary_name,secondary_email,secondary_phone,portal_token
       ) VALUES(
         v_teacher,v_parent,nullif(btrim(v_row->>'familyName'),''),
         nullif(btrim(v_row->>'email'),''),nullif(btrim(v_row->>'phone'),''),
         nullif(btrim(v_row->>'secondaryName'),''),
         nullif(btrim(v_row->>'secondaryEmail'),''),
         nullif(btrim(v_row->>'secondaryPhone'),''),
         encode(extensions.gen_random_bytes(24),'hex')
       ) RETURNING id INTO v_guardian;
       v_families:=v_families+1;
     END IF;
     v_group_ids:=jsonb_set(v_group_ids,ARRAY[v_key],to_jsonb(v_guardian::text),true);
   END IF;

   INSERT INTO public.students(
     teacher_id,name,guardian_id,birthdate,level,teacher_notes
   ) VALUES (
     v_teacher,v_name,v_guardian,nullif(v_row->>'birthdate','')::date,
     nullif(v_row->>'level',''),coalesce(v_row->>'teacherNotes','')
   );
   v_created:=v_created+1;
 END LOOP;
 v_result:=jsonb_build_object(
   'studentsCreated',v_created,'studentsSkipped',v_skipped,
   'familiesCreated',v_families,'skipped',v_skipped_rows,
   'receiptId',p_idempotency_key
 );
 UPDATE public.teacher_spreadsheet_import_receipts
 SET receipt=v_result WHERE teacher_id=v_teacher AND idempotency_key=p_idempotency_key;
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_teacher_spreadsheet_commit(jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_teacher_spreadsheet_commit(jsonb,uuid) TO authenticated;

-- Atomic, tenant-scoped one-off teaching sessions for 2–50 students.
-- No permanent group membership or mutating the frozen roster is necessary.
ALTER TABLE public.teaching_sessions
  ADD COLUMN roster_mode text NOT NULL DEFAULT 'standard',
  ADD CONSTRAINT ccp_session_roster_mode CHECK (roster_mode IN ('standard','ad_hoc'));
ALTER TABLE public.teaching_sessions DROP CONSTRAINT teaching_sessions_check;
ALTER TABLE public.teaching_sessions ADD CONSTRAINT ccp_session_roster_shape CHECK (
  (roster_mode='standard' AND ((group_id IS NULL) <> (student_id IS NULL)))
  OR (roster_mode='ad_hoc' AND group_id IS NULL AND student_id IS NULL)
);

-- Restrict direct API clients from switching roster mode. Existing standard
-- website calls retain INSERT rights on all preexisting public columns.
REVOKE INSERT, UPDATE ON public.teaching_sessions FROM authenticated;
GRANT INSERT (
  id,teacher_id,workplace_id,group_id,student_id,title,starts_at,
  duration_minutes,status,updated_at,lesson_note,request_id,created_at
) ON public.teaching_sessions TO authenticated;
GRANT UPDATE (
  title,starts_at,duration_minutes,status,updated_at,lesson_note
) ON public.teaching_sessions TO authenticated;

-- The same teacher lock protects direct website inserts/edits and MCP RPC.
CREATE OR REPLACE FUNCTION public.ccp_session_schedule_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='scheduled' THEN
   PERFORM pg_advisory_xact_lock(hashtextextended(NEW.teacher_id::text,0));
   IF EXISTS(
      SELECT 1 FROM public.teaching_sessions s
      WHERE s.teacher_id=NEW.teacher_id AND s.id<>NEW.id
        AND s.status='scheduled'
        AND tstzrange(s.starts_at,s.starts_at+s.duration_minutes*interval '1 minute','[)')
          && tstzrange(NEW.starts_at,NEW.starts_at+NEW.duration_minutes*interval '1 minute','[)')
   ) THEN
     RAISE EXCEPTION 'SESSION_CONFLICT' USING ERRCODE='23P01';
   END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_session_schedule_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS ccp_session_schedule_guard ON public.teaching_sessions;
CREATE TRIGGER ccp_session_schedule_guard
 BEFORE INSERT OR UPDATE OF starts_at,duration_minutes,status,roster_mode
 ON public.teaching_sessions FOR EACH ROW EXECUTE FUNCTION public.ccp_session_schedule_guard();

CREATE OR REPLACE FUNCTION public.ccp_teacher_ad_hoc_session_create(
  p_workplace_id uuid,p_student_ids uuid[],p_title text,p_starts_at timestamptz,
  p_duration_minutes integer,p_lesson_note text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_teacher uuid:=auth.uid();v_session public.teaching_sessions%ROWTYPE;
 v_count integer;v_participants uuid[];
BEGIN
 IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';END IF;
 IF p_workplace_id IS NULL OR p_request_id IS NULL
    OR length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 160
    OR length(coalesce(p_lesson_note,''))>10000
    OR p_starts_at IS NULL OR p_duration_minutes NOT BETWEEN 15 AND 480
    OR coalesce(array_length(p_student_ids,1),0) NOT BETWEEN 2 AND 50
    OR array_position(p_student_ids,NULL) IS NOT NULL THEN
   RAISE EXCEPTION 'INVALID_AD_HOC_SESSION' USING ERRCODE='22023';
 END IF;
 SELECT array_agg(x ORDER BY x),count(DISTINCT x)
 INTO v_participants,v_count FROM unnest(p_student_ids) x;
 IF v_count<>array_length(p_student_ids,1) THEN
   RAISE EXCEPTION 'DUPLICATE_PARTICIPANTS' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_teacher::text,0));
 PERFORM 1 FROM public.workplaces WHERE id=p_workplace_id AND teacher_id=v_teacher;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';END IF;
 SELECT count(*) INTO v_count
 FROM public.students s JOIN public.workplace_enrollments e
   ON e.teacher_id=s.teacher_id AND e.student_id=s.id
   AND e.workplace_id=p_workplace_id
 WHERE s.teacher_id=v_teacher AND s.archived_at IS NULL
   AND s.id=ANY(p_student_ids);
 IF v_count<>array_length(p_student_ids,1) THEN
   RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_session FROM public.teaching_sessions
 WHERE teacher_id=v_teacher AND request_id=p_request_id;
 IF FOUND THEN
   IF v_session.roster_mode<>'ad_hoc' OR v_session.workplace_id<>p_workplace_id
     OR v_session.title<>btrim(p_title)
     OR v_session.starts_at<>p_starts_at
     OR v_session.duration_minutes<>p_duration_minutes
     OR v_session.lesson_note<>coalesce(p_lesson_note,'')
     OR (SELECT array_agg(student_id ORDER BY student_id)
       FROM public.session_participants
       WHERE session_id=v_session.id AND teacher_id=v_teacher)
        IS DISTINCT FROM v_participants
   THEN RAISE EXCEPTION 'SESSION_REPLAY_CONFLICT' USING ERRCODE='23505';END IF;
 ELSE
   INSERT INTO public.teaching_sessions(
     teacher_id,workplace_id,roster_mode,title,starts_at,
     duration_minutes,lesson_note,request_id
   ) VALUES(
     v_teacher,p_workplace_id,'ad_hoc',btrim(p_title),p_starts_at,
     p_duration_minutes,coalesce(p_lesson_note,''),p_request_id
   ) RETURNING * INTO v_session;
   -- Ad-hoc roster begins with no attendance decisions.
   INSERT INTO public.session_participants(teacher_id,session_id,student_id)
     SELECT v_teacher,v_session.id,x FROM unnest(p_student_ids) x;
 END IF;
 RETURN jsonb_build_object(
  'id',v_session.id,'title',v_session.title,'starts_at',v_session.starts_at,
  'duration_minutes',v_session.duration_minutes,'lesson_note',v_session.lesson_note,
  'status',v_session.status,'workplace_id',v_session.workplace_id,
  'group_id',v_session.group_id,'student_id',v_session.student_id,
  'roster_mode',v_session.roster_mode
 );
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_teacher_ad_hoc_session_create(
 uuid,uuid[],text,timestamptz,integer,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_teacher_ad_hoc_session_create(
 uuid,uuid[],text,timestamptz,integer,text,uuid) TO authenticated;

-- Replace invoice draft notes and line items atomically in one owner-scoped
-- transaction. Never delete existing invoice items before all inputs are
-- validated, and rollback the entire write when any FK or trigger rejects.
ALTER TABLE public.invoices ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS ccp_invoice_revision ON public.invoices;
CREATE TRIGGER ccp_invoice_revision BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.ccp_touch_revision();

CREATE OR REPLACE FUNCTION public.ccp_invoice_draft_update(
 p_invoice_id uuid, p_notes text, p_items jsonb,
 p_expected_updated_at timestamptz, p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $invoice_draft$
DECLARE
 v_teacher uuid:=auth.uid();
 v_invoice public.invoices%ROWTYPE;
 v_count integer;v_line jsonb;v_prepared jsonb:='[]'::jsonb;
 v_kind text;v_lesson uuid;v_subtotal bigint:=0;v_number integer:=0;
 v_description text;v_quantity integer;v_unit integer;v_amount integer;
 v_hash text;
 v_old public.agent_tool_receipts%ROWTYPE;
 v_receipt jsonb;
BEGIN
 IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';END IF;
 IF p_idempotency_key IS NULL THEN
   RAISE EXCEPTION 'INVALID_INVOICE_DRAFT_REQUEST' USING ERRCODE='22023';
 END IF;
 IF p_notes IS NULL AND p_items IS NULL THEN
   RAISE EXCEPTION 'EMPTY_INVOICE_PATCH' USING ERRCODE='22023';
 END IF;
 IF p_notes IS NOT NULL AND length(p_notes)>2000 THEN
   RAISE EXCEPTION 'INVALID_INVOICE_NOTES' USING ERRCODE='22023';
 END IF;
 -- Insert-first serializes concurrent same-key browser/MCP retries.
 -- A failure below rolls this receipt and every invoice change back.
 v_hash:=md5(jsonb_build_array('billing.invoice.draft.update',p_invoice_id,
   p_notes,p_items,p_expected_updated_at)::text);
 INSERT INTO public.agent_tool_receipts(
   teacher_id,idempotency_key,operation,request_hash,receipt
 ) VALUES(v_teacher,p_idempotency_key,'billing.invoice.draft.update',
   v_hash,'{}'::jsonb) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN
   SELECT * INTO v_old FROM public.agent_tool_receipts
   WHERE teacher_id=v_teacher AND idempotency_key=p_idempotency_key;
   IF NOT FOUND OR v_old.operation<>'billing.invoice.draft.update'
     OR v_old.request_hash<>v_hash THEN
     RAISE EXCEPTION 'INVOICE_DRAFT_REQUEST_CONFLICT' USING ERRCODE='23505';
   END IF;
   RETURN v_old.receipt||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO v_invoice FROM public.invoices
 WHERE id=p_invoice_id AND teacher_id=v_teacher FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';END IF;
 IF v_invoice.status<>'draft' THEN
   RAISE EXCEPTION 'INVOICE_NOT_DRAFT' USING ERRCODE='23514';
 END IF;
 IF p_expected_updated_at IS NOT NULL AND
    v_invoice.updated_at<>p_expected_updated_at THEN
   RAISE EXCEPTION 'STALE_INVOICE_REVISION' USING ERRCODE='23505';
 END IF;
 IF p_items IS NOT NULL THEN
   IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)>100 THEN
     RAISE EXCEPTION 'INVALID_INVOICE_ITEMS' USING ERRCODE='22023';
   END IF;
   IF EXISTS(SELECT 1 FROM public.credit_packages
      WHERE teacher_id=v_teacher AND invoice_id=p_invoice_id) THEN
     RAISE EXCEPTION 'PREPAID_INVOICE_IMMUTABLE' USING ERRCODE='23514';
   END IF;
   FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
     v_description:=nullif(btrim(v_line->>'description'),'');
     IF jsonb_typeof(v_line)<>'object' OR v_description IS NULL
        OR length(v_description)>500 OR
        NOT (v_line ? 'quantity' AND v_line ? 'unitCents' AND v_line ? 'amountCents')
        OR coalesce(v_line->>'quantity','') !~ '^[0-9]+$'
        OR coalesce(v_line->>'unitCents','') !~ '^[0-9]+$'
        OR coalesce(v_line->>'amountCents','') !~ '^[0-9]+$' THEN
       RAISE EXCEPTION 'INVALID_INVOICE_LINE' USING ERRCODE='22023';
     END IF;
     v_quantity:=(v_line->>'quantity')::integer;
     v_unit:=(v_line->>'unitCents')::integer;
     v_amount:=(v_line->>'amountCents')::integer;
     IF v_quantity NOT BETWEEN 1 AND 10000
        OR v_unit NOT BETWEEN 0 AND 100000000
        OR v_amount NOT BETWEEN 0 AND 100000000 THEN
       RAISE EXCEPTION 'INVALID_INVOICE_LINE' USING ERRCODE='22023';
     END IF;
     v_lesson:=nullif(v_line->>'lessonId','')::uuid;
     IF v_lesson IS NOT NULL THEN
       PERFORM 1 FROM public.lessons WHERE id=v_lesson AND teacher_id=v_teacher;
       IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';END IF;
     END IF;
     v_kind:='lesson';
     IF nullif(v_line->>'id','') IS NOT NULL THEN
       SELECT kind INTO v_kind FROM public.invoice_items
       WHERE id=(v_line->>'id')::uuid AND invoice_id=p_invoice_id;
       v_kind:=coalesce(v_kind,'lesson');
     END IF;
     v_prepared:=v_prepared||jsonb_build_array(jsonb_build_object(
       'kind',v_kind,'lessonId',v_lesson,'description',v_description,
       'quantity',v_quantity,'unitCents',v_unit,'amountCents',v_amount,
       'sortOrder',v_number
     ));
     v_subtotal:=v_subtotal+v_amount;
     v_number:=v_number+1;
   END LOOP;
   IF v_subtotal>2147483647 THEN
     RAISE EXCEPTION 'INVOICE_SUBTOTAL_OVERFLOW' USING ERRCODE='22003';
   END IF;
   -- Once validation succeeds, all writes below run in this transaction.
   DELETE FROM public.invoice_items WHERE invoice_id=p_invoice_id;
   FOR v_line IN SELECT value FROM jsonb_array_elements(v_prepared) LOOP
     INSERT INTO public.invoice_items(
       invoice_id,lesson_id,kind,description,quantity,unit_cents,amount_cents,sort_order
     ) VALUES(
       p_invoice_id,(v_line->>'lessonId')::uuid,v_line->>'kind',v_line->>'description',
       (v_line->>'quantity')::integer,(v_line->>'unitCents')::integer,
       (v_line->>'amountCents')::integer,(v_line->>'sortOrder')::integer
     );
   END LOOP;
 END IF;
 UPDATE public.invoices
 SET subtotal_cents=CASE WHEN p_items IS NULL THEN subtotal_cents ELSE v_subtotal::integer END,
     notes=coalesce(p_notes,notes)
 WHERE id=p_invoice_id AND teacher_id=v_teacher AND status='draft'
 RETURNING * INTO v_invoice;
 v_receipt:=jsonb_build_object('ok',true,'invoiceId',p_invoice_id,
   'updatedAt',v_invoice.updated_at,'idempotencyKey',p_idempotency_key,
   'replayed',false);
 UPDATE public.agent_tool_receipts SET receipt=v_receipt
 WHERE teacher_id=v_teacher AND idempotency_key=p_idempotency_key;
 RETURN v_receipt;
END;
$invoice_draft$;
REVOKE ALL ON FUNCTION public.ccp_invoice_draft_update(
 uuid,text,jsonb,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_invoice_draft_update(
 uuid,text,jsonb,timestamptz,uuid) TO authenticated;

-- MCP and website use one revision-checked, idempotent session editor.
-- A teacher may update title, time/duration, shared note and completed/cancelled
-- status. Frozen lesson participants are deliberately immutable here.
-- One canonical current-schema write transaction for a coaching lesson:
-- topic/time/status AND explicit frozen-roster attendance. Both website
-- and delegated MCP use this function; there are no agent-only writers.
CREATE OR REPLACE FUNCTION public.ccp_teacher_session_commit(
  p_session_id uuid,p_changes jsonb,p_attendance jsonb,
  p_expected_updated_at timestamptz,p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $commit$
DECLARE
 v_teacher uuid:=auth.uid();
 v_session public.teaching_sessions%ROWTYPE;
 v_saved public.agent_tool_receipts%ROWTYPE;
 v_att public.session_attendance%ROWTYPE;
 v_hash text;
 v_row jsonb;
 v_student uuid;
 v_expected_att timestamptz;
 v_seen uuid[]:=ARRAY[]::uuid[];
 v_count integer;
 v_changed jsonb:='[]'::jsonb;
 v_receipt jsonb;
 v_last_status text;
 v_last_revision timestamptz;
 v_operation text;
BEGIN
 IF v_teacher IS NULL THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
 END IF;
 IF p_session_id IS NULL OR p_idempotency_key IS NULL OR
    p_changes IS NULL OR jsonb_typeof(p_changes)<>'object' OR
    p_attendance IS NULL OR jsonb_typeof(p_attendance)<>'array' OR
    (p_changes='{}'::jsonb AND p_attendance='[]'::jsonb) OR
    jsonb_array_length(p_attendance)>50 OR
    (p_changes<>'{}'::jsonb AND p_expected_updated_at IS NULL) OR
    (p_changes - ARRAY['title','startsAt','durationMinutes','lessonNote','status'])<>'{}'::jsonb THEN
   RAISE EXCEPTION 'INVALID_SESSION_COMMIT' USING ERRCODE='22023';
 END IF;
 IF (p_changes ? 'title' AND (
      jsonb_typeof(p_changes->'title')<>'string' OR
      char_length(btrim(p_changes->>'title')) NOT BETWEEN 1 AND 160))
    OR (p_changes ? 'lessonNote' AND (
      jsonb_typeof(p_changes->'lessonNote')<>'string' OR
      char_length(p_changes->>'lessonNote')>10000))
    OR (p_changes ? 'durationMinutes' AND (
      jsonb_typeof(p_changes->'durationMinutes')<>'number' OR
      (p_changes->>'durationMinutes') !~ '^[0-9]+$' OR
      (p_changes->>'durationMinutes')::integer NOT BETWEEN 15 AND 480))
    OR (p_changes ? 'status' AND (
      jsonb_typeof(p_changes->'status')<>'string' OR
      p_changes->>'status' NOT IN ('scheduled','completed','cancelled')))
    OR (p_changes ? 'startsAt' AND jsonb_typeof(p_changes->'startsAt')<>'string') THEN
   RAISE EXCEPTION 'INVALID_SESSION_COMMIT' USING ERRCODE='22023';
 END IF;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_attendance) LOOP
   IF jsonb_typeof(v_row)<>'object' OR
      (v_row - ARRAY['studentId','status','note','expectedUpdatedAt','noticeAt','cancelReason'])<>'{}'::jsonb OR
      jsonb_typeof(v_row->'studentId')<>'string' OR
      jsonb_typeof(v_row->'status')<>'string' OR
      jsonb_typeof(v_row->'expectedUpdatedAt') NOT IN ('string','null') OR
      v_row->>'status' NOT IN ('present','absent','late','excused','student_cancelled','teacher_cancelled') OR
      char_length(coalesce(v_row->>'note',''))>5000 OR
      (v_row ? 'noticeAt' AND jsonb_typeof(v_row->'noticeAt')<>'string') OR
      (v_row ? 'cancelReason' AND (jsonb_typeof(v_row->'cancelReason')<>'string'
        OR char_length(v_row->>'cancelReason')>1000)) OR
      (v_row->>'status')='student_cancelled' AND
        (NOT (v_row ? 'noticeAt') OR coalesce(v_row->>'noticeAt','')='') OR
      (v_row->>'status') NOT IN ('student_cancelled','teacher_cancelled') AND
        (v_row ? 'noticeAt' OR v_row ? 'cancelReason') THEN
     RAISE EXCEPTION 'INVALID_SESSION_ATTENDANCE' USING ERRCODE='22023';
   END IF;
   v_student:=(v_row->>'studentId')::uuid;
   IF v_student=ANY(v_seen) THEN
     RAISE EXCEPTION 'DUPLICATE_ATTENDANCE_STUDENT' USING ERRCODE='22023';
   END IF;
   v_seen:=array_append(v_seen,v_student);
 END LOOP;
 v_hash:=md5(jsonb_build_array('sessions.commit',p_session_id,p_changes,
   p_attendance,p_expected_updated_at)::text);
 INSERT INTO public.agent_tool_receipts(
   teacher_id,idempotency_key,operation,request_hash,receipt
 ) VALUES(v_teacher,p_idempotency_key,'sessions.commit',v_hash,'{}'::jsonb)
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN
   SELECT * INTO v_saved FROM public.agent_tool_receipts
    WHERE teacher_id=v_teacher AND idempotency_key=p_idempotency_key;
   IF NOT FOUND OR v_saved.operation<>'sessions.commit' OR v_saved.request_hash<>v_hash THEN
     RAISE EXCEPTION 'SESSION_REPLAY_CONFLICT' USING ERRCODE='23505';
   END IF;
   RETURN v_saved.receipt;
 END IF;
 SELECT * INTO v_session FROM public.teaching_sessions
   WHERE id=p_session_id AND teacher_id=v_teacher FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF p_changes<>'{}'::jsonb AND v_session.updated_at IS DISTINCT FROM p_expected_updated_at THEN
   RAISE EXCEPTION 'SESSION_REVISION_CONFLICT' USING ERRCODE='23505';
 END IF;
 -- Status=completed is possible only with an explicit, complete frozen
 -- roster. An empty array is NOT a valid shortcut, even if some attendance
 -- was recorded individually before completion.
 IF (p_changes->>'status')='completed' THEN
   SELECT count(*) INTO v_count FROM public.session_participants
    WHERE teacher_id=v_teacher AND session_id=p_session_id;
   IF v_count=0 OR v_count<>jsonb_array_length(p_attendance) THEN
     RAISE EXCEPTION 'INCOMPLETE_SESSION_ROSTER' USING ERRCODE='22023';
   END IF;
   -- Transaction-local proof read by the status trigger. Direct PostgREST
   -- updates cannot create completed sessions outside this RPC.
   PERFORM set_config('ccp.confirmed_session_completion',p_session_id::text,true);
 END IF;
 IF p_changes<>'{}'::jsonb THEN
   UPDATE public.teaching_sessions SET
    title=CASE WHEN p_changes ? 'title' THEN btrim(p_changes->>'title') ELSE title END,
    starts_at=CASE WHEN p_changes ? 'startsAt' THEN
      (p_changes->>'startsAt')::timestamptz ELSE starts_at END,
    duration_minutes=CASE WHEN p_changes ? 'durationMinutes' THEN
      (p_changes->>'durationMinutes')::integer ELSE duration_minutes END,
    lesson_note=CASE WHEN p_changes ? 'lessonNote' THEN
      p_changes->>'lessonNote' ELSE lesson_note END,
    status=CASE WHEN p_changes ? 'status' THEN
      p_changes->>'status' ELSE status END,
    updated_at=clock_timestamp()
   WHERE id=p_session_id AND teacher_id=v_teacher RETURNING * INTO v_session;
 END IF;
 -- Only the scoped, revision-checked shared transaction may mutate a
 -- participant decision. The table trigger rejects direct REST updates.
 PERFORM set_config('ccp.attendance_commit_session',p_session_id::text,true);
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_attendance) LOOP
   v_student:=(v_row->>'studentId')::uuid;
   v_expected_att:=(v_row->>'expectedUpdatedAt')::timestamptz;
   IF NOT EXISTS (
     SELECT 1 FROM public.session_participants
     WHERE teacher_id=v_teacher AND session_id=p_session_id AND student_id=v_student
   ) THEN
     RAISE EXCEPTION 'ATTENDANCE_NOT_IN_FROZEN_ROSTER' USING ERRCODE='42501';
   END IF;
   -- NULL means no decision existed at preview time. A concurrent first
   -- decision makes this INSERT conflict; non-NULL requires the exact revision.
   IF v_expected_att IS NULL THEN
     INSERT INTO public.session_attendance(
       teacher_id,session_id,student_id,status,note,notice_at,
       cancelled_by,cancel_reason,marked_at,marked_by,updated_at
     ) VALUES (
       v_teacher,p_session_id,v_student,v_row->>'status',
       coalesce(v_row->>'note',''),
       CASE WHEN v_row->>'status' IN ('student_cancelled','teacher_cancelled')
         THEN (v_row->>'noticeAt')::timestamptz ELSE NULL END,
       CASE WHEN v_row->>'status'='student_cancelled' THEN 'student'
         WHEN v_row->>'status'='teacher_cancelled' THEN 'teacher' ELSE NULL END,
       CASE WHEN v_row->>'status' IN ('student_cancelled','teacher_cancelled')
         THEN coalesce(v_row->>'cancelReason','') ELSE '' END,
       clock_timestamp(),v_teacher,clock_timestamp()
     ) ON CONFLICT (session_id,student_id) DO NOTHING RETURNING * INTO v_att;
   ELSE
     UPDATE public.session_attendance
        SET status=v_row->>'status',
            note=coalesce(v_row->>'note',''),
            notice_at=CASE WHEN v_row->>'status' IN ('student_cancelled','teacher_cancelled')
              THEN (v_row->>'noticeAt')::timestamptz ELSE NULL END,
            cancelled_by=CASE WHEN v_row->>'status'='student_cancelled' THEN 'student'
              WHEN v_row->>'status'='teacher_cancelled' THEN 'teacher' ELSE NULL END,
            cancel_reason=CASE WHEN v_row->>'status' IN ('student_cancelled','teacher_cancelled')
              THEN coalesce(v_row->>'cancelReason','') ELSE '' END,
            marked_at=clock_timestamp(),marked_by=v_teacher,
            updated_at=clock_timestamp()
      WHERE teacher_id=v_teacher AND session_id=p_session_id
        AND student_id=v_student AND updated_at=v_expected_att
      RETURNING * INTO v_att;
   END IF;
   IF NOT FOUND THEN
     RAISE EXCEPTION 'ATTENDANCE_REVISION_CONFLICT_OR_NOT_FOUND'
       USING ERRCODE='23505';
   END IF;
   v_last_status:=v_att.status;
   v_last_revision:=v_att.updated_at;
   v_changed:=v_changed||jsonb_build_array(jsonb_build_object(
     'studentId',v_att.student_id,'status',v_att.status,'note',v_att.note,
     'noticeAt',v_att.notice_at,'cancelledBy',v_att.cancelled_by,
     'cancelReason',v_att.cancel_reason,'markedAt',v_att.marked_at,
     'revision',v_att.updated_at));
 END LOOP;
 v_operation:=CASE WHEN p_changes='{}'::jsonb THEN 'attendance.record'
   WHEN p_changes = jsonb_build_object('lessonNote',p_changes->>'lessonNote')
     AND p_attendance='[]'::jsonb THEN 'sessions.note.update'
   ELSE 'sessions.commit' END;
 v_receipt:=jsonb_build_object('operation',v_operation,
   'sessionId',v_session.id,'revision',
     CASE WHEN p_changes='{}'::jsonb THEN v_last_revision ELSE v_session.updated_at END,
   'status',coalesce(v_last_status,v_session.status),
   'attendance',v_changed,'idempotencyKey',p_idempotency_key);
 UPDATE public.agent_tool_receipts SET receipt=v_receipt
   WHERE teacher_id=v_teacher AND idempotency_key=p_idempotency_key;
 RETURN v_receipt;
END;
$commit$;
REVOKE ALL ON FUNCTION public.ccp_teacher_session_commit(
 uuid,jsonb,jsonb,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_teacher_session_commit(
 uuid,jsonb,jsonb,timestamptz,uuid) TO authenticated;

-- Prevent owner-scoped direct PostgREST UPDATE from bypassing immutable
-- attendance revisions, confirmation, cancellation provenance and receipts.
-- Roster correction creates/deletes rows through its own audited RPC; only
-- an existing participant decision UPDATE requires this session-local proof.
CREATE OR REPLACE FUNCTION public.ccp_session_attendance_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $attendance_guard$
BEGIN
 IF current_setting('ccp.attendance_commit_session',true) IS DISTINCT FROM NEW.session_id::text
    OR NEW.session_id IS DISTINCT FROM OLD.session_id
    OR NEW.student_id IS DISTINCT FROM OLD.student_id
    OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id THEN
   RAISE EXCEPTION 'ATTENDANCE_UPDATE_REQUIRES_COMMIT'
     USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$attendance_guard$;
REVOKE ALL ON FUNCTION public.ccp_session_attendance_write_guard() FROM PUBLIC,anon;
CREATE TRIGGER ccp_session_attendance_write_guard
 BEFORE UPDATE ON public.session_attendance
 FOR EACH ROW EXECUTE FUNCTION public.ccp_session_attendance_write_guard();

-- Enforce the canonical completed transition at the table boundary, not only
-- at website/MCP validators. An authenticated direct PostgREST UPDATE cannot
-- bypass the full-roster, revisioned transaction by setting status='completed'.
CREATE FUNCTION public.ccp_completed_session_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $complete_guard$
BEGIN
 IF auth.uid() IS NOT NULL AND NEW.status='completed'
    AND OLD.status IS DISTINCT FROM 'completed'
    AND current_setting('ccp.confirmed_session_completion',true)
         IS DISTINCT FROM NEW.id::text THEN
   RAISE EXCEPTION 'COMPLETION_REQUIRES_FROZEN_ROSTER'
     USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END;
$complete_guard$;
REVOKE ALL ON FUNCTION public.ccp_completed_session_guard()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER ccp_completed_session_guard_trg
 BEFORE UPDATE OF status ON public.teaching_sessions
 FOR EACH ROW EXECUTE FUNCTION public.ccp_completed_session_guard();

-- Explicit current-schema attendance transaction for the calendar's
-- still-supported private lesson workflows. Website and MCP share the same
-- tenant-authenticated mutation while the full occurrence cutover is pending.
-- Serialize on the lesson row even when attendance has not yet been inserted.
CREATE OR REPLACE FUNCTION public.ccp_calendar_attendance_commit(
 p_lesson_id uuid,p_status text,p_notice_at timestamptz,
 p_cancel_note text,p_expected_marked_at timestamptz,p_idempotency_key uuid,
 p_notify_family boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $calendar_attendance$
DECLARE
 v_teacher uuid:=auth.uid();
 v_lesson public.lessons%ROWTYPE;
 v_att public.attendance%ROWTYPE;
 v_saved public.agent_tool_receipts%ROWTYPE;
 v_hash text;v_saved_receipt jsonb;v_receipt jsonb;
BEGIN
 IF v_teacher IS NULL THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
 END IF;
 IF p_lesson_id IS NULL OR p_idempotency_key IS NULL OR
   (p_status IS NOT NULL AND p_status NOT IN
    ('attended','teacher_cancel','student_cancel','no_show')) OR
    char_length(coalesce(p_cancel_note,''))>1000 OR
    p_notify_family IS NULL OR
    (p_notify_family AND p_status IS DISTINCT FROM 'teacher_cancel') OR
    (p_status IS DISTINCT FROM 'student_cancel' AND p_notice_at IS NOT NULL) THEN
   RAISE EXCEPTION 'INVALID_CALENDAR_ATTENDANCE' USING ERRCODE='22023';
 END IF;
 v_hash:=md5(jsonb_build_array('calendar.attendance.commit',
   p_lesson_id,p_status,p_notice_at,p_cancel_note,p_expected_marked_at,
   p_notify_family)::text);
 INSERT INTO public.agent_tool_receipts(
   teacher_id,idempotency_key,operation,request_hash,receipt
 ) VALUES(v_teacher,p_idempotency_key,'calendar.attendance.commit',
   v_hash,'{}'::jsonb) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN
   SELECT * INTO v_saved FROM public.agent_tool_receipts
    WHERE teacher_id=v_teacher AND idempotency_key=p_idempotency_key;
   IF NOT FOUND OR v_saved.operation<>'calendar.attendance.commit'
      OR v_saved.request_hash<>v_hash THEN
     RAISE EXCEPTION 'CALENDAR_ATTENDANCE_REPLAY_CONFLICT' USING ERRCODE='23505';
   END IF;
   RETURN v_saved.receipt||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO v_lesson FROM public.lessons
  WHERE teacher_id=v_teacher AND id=p_lesson_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CALENDAR_LESSON_NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_att FROM public.attendance
  WHERE lesson_id=p_lesson_id FOR UPDATE;
 IF v_att.marked_at IS DISTINCT FROM p_expected_marked_at THEN
   RAISE EXCEPTION 'CALENDAR_ATTENDANCE_REVISION_CONFLICT' USING ERRCODE='23505';
 END IF;
 IF p_status IS NULL THEN
   DELETE FROM public.attendance WHERE lesson_id=p_lesson_id;
   v_receipt:=jsonb_build_object('ok',true,'cleared',true,
     'lessonId',p_lesson_id,'idempotencyKey',p_idempotency_key);
 ELSIF v_att.id IS NULL THEN
   INSERT INTO public.attendance(lesson_id,status,notice_at,cancel_note,marked_at)
    VALUES(p_lesson_id,p_status,p_notice_at,coalesce(p_cancel_note,''),
      clock_timestamp()) RETURNING * INTO v_att;
   v_receipt:=to_jsonb(v_att)||
     jsonb_build_object('idempotencyKey',p_idempotency_key);
 ELSE
   UPDATE public.attendance SET
    status=p_status,notice_at=p_notice_at,
    cancel_note=coalesce(p_cancel_note,''),marked_at=clock_timestamp()
    WHERE id=v_att.id RETURNING * INTO v_att;
   v_receipt:=to_jsonb(v_att)||
     jsonb_build_object('idempotencyKey',p_idempotency_key);
 END IF;
 UPDATE public.agent_tool_receipts SET receipt=v_receipt
  WHERE teacher_id=v_teacher AND idempotency_key=p_idempotency_key;
 RETURN v_receipt||jsonb_build_object('replayed',false);
END;
$calendar_attendance$;
REVOKE ALL ON FUNCTION public.ccp_calendar_attendance_commit(
 uuid,text,timestamptz,text,timestamptz,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_calendar_attendance_commit(
 uuid,text,timestamptz,text,timestamptz,uuid,boolean) TO authenticated;

-- Portal cancellations are a separate guardian-originated mutation, not a
-- privilege to impersonate a teacher's authenticated attendance RPC. The
-- portal token is checked *inside* the same transaction that locks the lesson,
-- guardian and student, then records the attendance decision. A duplicate
-- request returns its original timestamp without generating another notice.
CREATE OR REPLACE FUNCTION public.ccp_portal_cancel_lesson(
 p_portal_token text,p_lesson_id uuid,p_cancel_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $portal_cancel$
DECLARE
 v_teacher uuid;
 v_student_name text;
 v_starts_at timestamptz;
 v_att public.attendance%ROWTYPE;
 v_now timestamptz;
BEGIN
 IF p_portal_token IS NULL OR length(p_portal_token) NOT BETWEEN 32 AND 256
    OR p_lesson_id IS NULL THEN
   RAISE EXCEPTION 'PORTAL_NOT_FOUND' USING ERRCODE='42501';
 END IF;
 IF p_cancel_note IS NULL OR char_length(p_cancel_note)>1000 THEN
   RAISE EXCEPTION 'PORTAL_INVALID_NOTE' USING ERRCODE='22023';
 END IF;
 -- The capability and the affected lesson must have the SAME teacher. Lock
 -- the underlying rows so portal-token rotation, student reassignment, and
 -- teacher attendance commits cannot race this decision.
 SELECT l.teacher_id,s.name,l.starts_at
  INTO v_teacher,v_student_name,v_starts_at
 FROM public.lessons l
 JOIN public.students s ON s.id=l.student_id
  AND s.teacher_id=l.teacher_id
 JOIN public.guardians g ON g.id=s.guardian_id
  AND g.teacher_id=l.teacher_id
 WHERE l.id=p_lesson_id AND g.portal_token=p_portal_token
 FOR UPDATE OF l,s,g;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'PORTAL_NOT_FOUND' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_att FROM public.attendance
  WHERE lesson_id=p_lesson_id FOR UPDATE;
 IF v_att.id IS NOT NULL THEN
   IF v_att.status='student_cancel' THEN
     RETURN jsonb_build_object('ok',true,'replayed',true,
       'noticeAt',v_att.notice_at,'cancelNote',v_att.cancel_note,
       'teacherId',v_teacher,'studentName',v_student_name,
       'startsAt',v_starts_at);
   END IF;
   RAISE EXCEPTION 'PORTAL_ALREADY_MARKED' USING ERRCODE='23514';
 END IF;
 IF v_starts_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'PORTAL_TOO_LATE' USING ERRCODE='22023';
 END IF;
 v_now:=clock_timestamp();
 INSERT INTO public.attendance(lesson_id,status,notice_at,marked_at,cancel_note)
 VALUES(p_lesson_id,'student_cancel',v_now,v_now,p_cancel_note)
 RETURNING * INTO v_att;
 RETURN jsonb_build_object('ok',true,'replayed',false,
   'noticeAt',v_att.notice_at,'cancelNote',v_att.cancel_note,
   'teacherId',v_teacher,'studentName',v_student_name,
   'startsAt',v_starts_at);
END;
$portal_cancel$;
REVOKE ALL ON FUNCTION public.ccp_portal_cancel_lesson(text,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ccp_portal_cancel_lesson(text,uuid,text)
 TO service_role;

-- Remove a recurring *intent* without discarding evidence of actual lessons.
-- One lock/transaction covers the slot, future occurrences and their finance /
-- attendance references, so a partial sequence cannot erase historical work.
CREATE OR REPLACE FUNCTION public.ccp_calendar_slot_delete(p_slot_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $calendar_slot_delete$
DECLARE
 v_teacher uuid:=auth.uid();
 v_now timestamptz:=clock_timestamp();
 v_slot public.lesson_slots%ROWTYPE;
 v_count integer;
 v_removed integer:=0;
 v_preserved integer:=0;
BEGIN
 IF v_teacher IS NULL OR p_slot_id IS NULL THEN
   RAISE EXCEPTION 'CALENDAR_SLOT_NOT_FOUND' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_slot FROM public.lesson_slots
   WHERE id=p_slot_id AND teacher_id=v_teacher FOR UPDATE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'CALENDAR_SLOT_NOT_FOUND' USING ERRCODE='42501';
 END IF;
 SELECT count(*) INTO v_count FROM public.lessons
   WHERE teacher_id=v_teacher AND slot_id=p_slot_id AND starts_at>=v_now;
 IF v_count>20000 THEN
   RAISE EXCEPTION 'CALENDAR_SLOT_TOO_MANY' USING ERRCODE='22023';
 END IF;
 -- Lock all currently linked occurrences before deciding whether one is safe
 -- to remove. The referenced-row lock also serializes concurrent attendance
 -- commitments and new billing/credit associations.
 PERFORM 1 FROM public.lessons
   WHERE teacher_id=v_teacher AND slot_id=p_slot_id
   ORDER BY id FOR UPDATE;
 SELECT count(*) INTO v_count FROM public.lessons
   WHERE teacher_id=v_teacher AND slot_id=p_slot_id AND starts_at>=v_now;
 IF v_count>20000 THEN
   RAISE EXCEPTION 'CALENDAR_SLOT_TOO_MANY' USING ERRCODE='22023';
 END IF;
 -- An unmarked future recurrence is disposable ONLY if it is not associated
 -- with any paid/invoiced lesson, redeemed credit, makeup, teacher note or
 -- historical reschedule. Earlier occurrences always survive.
 DELETE FROM public.lessons l
  WHERE l.teacher_id=v_teacher AND l.slot_id=p_slot_id
    AND l.starts_at>=v_now
    AND l.rescheduled_from_date IS NULL
    AND l.makeup_for IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.attendance a WHERE a.lesson_id=l.id)
    AND NOT EXISTS(SELECT 1 FROM public.lesson_notes n WHERE n.lesson_id=l.id)
    AND NOT EXISTS(SELECT 1 FROM public.invoice_items i WHERE i.lesson_id=l.id)
    AND NOT EXISTS(SELECT 1 FROM public.credit_redemptions c WHERE c.lesson_id=l.id);
 GET DIAGNOSTICS v_removed=ROW_COUNT;
 SELECT count(*) INTO v_preserved FROM public.lessons
   WHERE teacher_id=v_teacher AND slot_id=p_slot_id;
 -- The FK's ON DELETE SET NULL intentionally detaches ALL preserved lessons:
 -- none is lost, but none is still tied to a no-longer-existing recurrence.
 DELETE FROM public.lesson_slots
   WHERE id=p_slot_id AND teacher_id=v_teacher;
 RETURN jsonb_build_object('ok',true,'removed',v_removed,'preserved',v_preserved);
END;
$calendar_slot_delete$;
REVOKE ALL ON FUNCTION public.ccp_calendar_slot_delete(uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_calendar_slot_delete(uuid)
 TO authenticated;
-- A raw DELETE would bypass the preservation transaction; only the website
-- and MCP shared service may invoke it for a teacher.
REVOKE DELETE ON public.lesson_slots FROM PUBLIC,authenticated;

-- All ordinary teacher attendance writes must go through the optimistic,
-- receipt-backed ccp_calendar_attendance_commit RPC. The token-authorized
-- guardian writer above is available ONLY to the server-side service role.
-- SELECT remains available to teachers through tenant RLS.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.attendance
 FROM authenticated,PUBLIC;

-- Historical direct lessons must outlive current workplace enrollment.
-- Existing FK tied lessons to the *live* membership row, making a safe
-- unenroll impossible even for completed/past lessons. Keep student and
-- workplace ownership FKs; enforce CURRENT enrollment on new direct
-- sessions using a row-locking trigger instead.
ALTER TABLE public.teaching_sessions
  DROP CONSTRAINT IF EXISTS teaching_sessions_teacher_id_workplace_id_student_id_fkey;

CREATE OR REPLACE FUNCTION public.ccp_direct_session_enrollment_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_enrollment uuid;
BEGIN
  IF NEW.student_id IS NULL THEN RETURN NEW; END IF;
  -- This lock serializes direct lesson creation with current-membership
  -- deletion, so a future lesson cannot silently appear after unenrollment.
  SELECT e.id INTO v_enrollment
    FROM public.workplace_enrollments e
    JOIN public.students s ON s.id=e.student_id AND s.teacher_id=e.teacher_id
    WHERE e.teacher_id=NEW.teacher_id
      AND e.workplace_id=NEW.workplace_id
      AND e.student_id=NEW.student_id
      AND s.archived_at IS NULL
    FOR KEY SHARE OF e;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STUDENT_NOT_ENROLLED'
      USING ERRCODE='23503';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_direct_session_enrollment_guard()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS ccp_direct_session_enrollment_guard ON public.teaching_sessions;
CREATE TRIGGER ccp_direct_session_enrollment_guard
BEFORE INSERT OR UPDATE OF student_id,workplace_id
ON public.teaching_sessions
FOR EACH ROW EXECUTE FUNCTION public.ccp_direct_session_enrollment_guard();

-- New hosted teachers must inherit database-level capacity enforcement.
-- An inserted trial/paid preview row previously inherited hosted_enforced=false,
-- letting direct authenticated writes bypass eventual free active-student caps.
-- Self-hosted free teachers retain their unrestricted default (false).
CREATE OR REPLACE FUNCTION public.ccp_enforce_hosted_teacher_origin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.hosted_plan IN ('trial','pro','founding','gifted') THEN
    NEW.hosted_enforced:=true;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_enforce_hosted_teacher_origin()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS ccp_enforce_hosted_teacher_origin ON public.teachers;
CREATE TRIGGER ccp_enforce_hosted_teacher_origin
BEFORE INSERT OR UPDATE OF hosted_plan,hosted_enforced
ON public.teachers
FOR EACH ROW EXECUTE FUNCTION public.ccp_enforce_hosted_teacher_origin();

-- A prepaid lesson package is one financial transaction: its invoice,
-- invoice line and package must either ALL exist or NONE exist. Serialized
-- request IDs prevent a retry from silently selling the same package twice.
-- Every caller (website and delegated MCP) uses the same owner-scoped RPC.
ALTER TABLE public.credit_packages ADD COLUMN IF NOT EXISTS request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS ccp_credit_packages_teacher_request
  ON public.credit_packages(teacher_id,request_id)
  WHERE request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ccp_credit_package_create(
  p_student_id uuid,
  p_credits integer,
  p_duration_minutes integer,
  p_price_cents integer,
  p_starts_on date,
  p_expires_on date DEFAULT NULL,
  p_request_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_teacher uuid := auth.uid();
  v_student public.students%ROWTYPE;
  v_policy public.studio_policies%ROWTYPE;
  v_existing public.credit_packages%ROWTYPE;
  v_invoice_id uuid;
  v_package_id uuid;
  v_today date;
  v_description text;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;

  IF p_credits IS NULL OR p_credits NOT BETWEEN 1 AND 200 OR
     p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 5 AND 480 OR
     p_price_cents IS NULL OR p_price_cents < 0 OR
     p_starts_on IS NULL OR
     (p_expires_on IS NOT NULL AND p_expires_on < p_starts_on) THEN
    RAISE EXCEPTION 'INVALID_CREDIT_PACKAGE' USING ERRCODE='22023';
  END IF;

  -- With a request ID, concurrent retries serialize before inspecting the
  -- receipt, so a timeout/retry cannot create a second invoice.
  IF p_request_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      v_teacher::text || ':credit-package:' || p_request_id::text,0));
    SELECT * INTO v_existing FROM public.credit_packages
      WHERE teacher_id=v_teacher AND request_id=p_request_id;
    IF FOUND THEN
      IF v_existing.student_id IS DISTINCT FROM p_student_id OR
         v_existing.credits IS DISTINCT FROM p_credits OR
         v_existing.duration_minutes IS DISTINCT FROM p_duration_minutes OR
         v_existing.price_cents IS DISTINCT FROM p_price_cents OR
         v_existing.starts_on IS DISTINCT FROM p_starts_on OR
         v_existing.expires_on IS DISTINCT FROM p_expires_on THEN
        RAISE EXCEPTION 'CREDIT_REQUEST_CONFLICT' USING ERRCODE='23505';
      END IF;
      RETURN jsonb_build_object('packageId',v_existing.id,
        'invoiceId',v_existing.invoice_id,'replayed',true);
    END IF;
  END IF;

  SELECT * INTO v_student FROM public.students
    WHERE id=p_student_id AND teacher_id=v_teacher FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';
  END IF;
  IF v_student.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'ARCHIVED_STUDENT' USING ERRCODE='23514';
  END IF;
  IF v_student.guardian_id IS NULL THEN
    RAISE EXCEPTION 'FAMILY_REQUIRED' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.guardians
    WHERE id=v_student.guardian_id AND teacher_id=v_teacher FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_policy FROM public.studio_policies
    WHERE teacher_id=v_teacher;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POLICY_NOT_FOUND' USING ERRCODE='42501';
  END IF;
  v_today := (now() AT TIME ZONE v_policy.timezone)::date;
  v_description := 'Prepaid ' || p_credits::text || ' × ' ||
    p_duration_minutes::text || '-min lesson' ||
    CASE WHEN p_credits=1 THEN '' ELSE 's' END || ' - ' || v_student.name;

  INSERT INTO public.invoices (
    teacher_id,guardian_id,period_start,period_end,status,
    subtotal_cents,currency
  ) VALUES (
    v_teacher,v_student.guardian_id,v_today,v_today,'draft',
    p_price_cents,v_policy.currency
  ) RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_items (
    invoice_id,lesson_id,kind,description,quantity,
    unit_cents,amount_cents,sort_order
  ) VALUES (
    v_invoice_id,NULL,'credit_package',v_description,1,
    p_price_cents,p_price_cents,0
  );

  INSERT INTO public.credit_packages (
    teacher_id,student_id,invoice_id,credits,duration_minutes,
    price_cents,starts_on,expires_on,request_id
  ) VALUES (
    v_teacher,p_student_id,v_invoice_id,p_credits,p_duration_minutes,
    p_price_cents,p_starts_on,p_expires_on,p_request_id
  ) RETURNING id INTO v_package_id;

  RETURN jsonb_build_object('packageId',v_package_id,
    'invoiceId',v_invoice_id,'replayed',false);
END;
$$;

REVOKE ALL ON FUNCTION public.ccp_credit_package_create(
  uuid,integer,integer,integer,date,date,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ccp_credit_package_create(
  uuid,integer,integer,integer,date,date,uuid) TO authenticated;

-- Durable at-most-once external invitation/reminder send attempt per event,
-- family, mode and reviewed message. No contact addresses or portal secrets
-- are persisted in receipts. A provider timeout is ambiguous: manual review
-- is required rather than automatically sending a duplicate.
CREATE TABLE public.event_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL REFERENCES public.guardians(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK(mode IN ('invite','reminder')),
  content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'attempted'
    CHECK(status IN ('attempted','sent','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE(teacher_id,event_id,guardian_id,mode,content_hash)
);
CREATE INDEX ccp_event_email_deliveries_event
  ON public.event_email_deliveries(teacher_id,event_id);

ALTER TABLE public.event_email_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY ccp_event_email_deliveries_teacher ON public.event_email_deliveries
  FOR ALL TO authenticated
  USING (teacher_id=auth.uid())
  WITH CHECK (
    teacher_id=auth.uid()
    AND EXISTS(SELECT 1 FROM public.events e
      WHERE e.id=event_id AND e.teacher_id=auth.uid())
    AND EXISTS(SELECT 1 FROM public.guardians g
      WHERE g.id=guardian_id AND g.teacher_id=auth.uid())
  );
REVOKE ALL ON public.event_email_deliveries FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.event_email_deliveries TO authenticated;

-- Invoice-period commits and draft regeneration must not leave orphaned
-- invoice lines, partially consumed lesson credits or half-created families
-- when any write, validation or concurrent request fails. Both the website
-- and delegated MCP call these authenticated, transaction-scoped functions.

CREATE OR REPLACE FUNCTION public.ccp_invoice_generation_commit(
  p_period_start date,p_period_end date,p_drafts jsonb,p_redemptions jsonb,
  p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid:=auth.uid();
  v_currency text;
  v_draft jsonb;v_line jsonb;v_credit jsonb;
  v_invoice uuid;v_lesson uuid;v_guardian uuid;v_package uuid;
  v_kind text;v_description text;v_qty integer;v_unit integer;v_amount integer;
  v_subtotal bigint;v_sort integer;
  v_created jsonb:='[]'::jsonb;v_count integer:=0;v_credits integer:=0;
  v_hash text;v_prior public.agent_tool_receipts%ROWTYPE;v_receipt jsonb;
BEGIN
  IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';END IF;
  IF p_request_id IS NULL OR p_period_start IS NULL OR p_period_end IS NULL
    OR p_period_end<p_period_start OR p_period_end-p_period_start>367
    OR jsonb_typeof(p_drafts)<>'array'
    OR jsonb_typeof(p_redemptions)<>'array'
    OR jsonb_array_length(p_drafts)>200
    OR jsonb_array_length(p_redemptions)>2000
  THEN RAISE EXCEPTION 'INVALID_BILLING_BATCH' USING ERRCODE='22023';END IF;
  -- One teacher-period commit in flight at a time (including independent
  -- browser and AI-agent requests). Lesson and package triggers separately
  -- protect against other concurrent billing/credit operations.
  PERFORM 1 FROM public.teachers WHERE id=v_teacher FOR UPDATE;
  v_hash:=md5(jsonb_build_array('billing.generation.commit',
    p_period_start,p_period_end)::text);
  INSERT INTO public.agent_tool_receipts(
    teacher_id,idempotency_key,operation,request_hash,receipt
  ) VALUES(v_teacher,p_request_id,'billing.generation.commit',v_hash,'{}'::jsonb)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO v_prior FROM public.agent_tool_receipts
      WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
    IF NOT FOUND OR v_prior.operation<>'billing.generation.commit' OR
      v_prior.request_hash<>v_hash THEN
      RAISE EXCEPTION 'BILLING_GENERATION_REQUEST_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN v_prior.receipt||jsonb_build_object('replayed',true);
  END IF;
  SELECT currency INTO v_currency FROM public.studio_policies
    WHERE teacher_id=v_teacher;
  IF v_currency IS NULL THEN
    RAISE EXCEPTION 'STUDIO_POLICY_NOT_FOUND' USING ERRCODE='42501';
  END IF;

  FOR v_credit IN SELECT value FROM jsonb_array_elements(p_redemptions) LOOP
    v_lesson:=(v_credit->>'lessonId')::uuid;
    v_package:=(v_credit->>'packageId')::uuid;
    IF v_lesson IS NULL OR v_package IS NULL THEN
      RAISE EXCEPTION 'INVALID_CREDIT_ALLOCATION' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.credit_redemptions(teacher_id,lesson_id,package_id)
      VALUES(v_teacher,v_lesson,v_package);
    v_credits:=v_credits+1;
  END LOOP;

  FOR v_draft IN SELECT value FROM jsonb_array_elements(p_drafts) LOOP
    v_guardian:=(v_draft->>'guardianId')::uuid;
    IF v_guardian IS NULL OR NOT EXISTS(
      SELECT 1 FROM public.guardians WHERE id=v_guardian AND teacher_id=v_teacher
    ) OR jsonb_typeof(v_draft->'items')<>'array'
      OR jsonb_array_length(v_draft->'items')=0
      OR jsonb_array_length(v_draft->'items')>2000
    THEN RAISE EXCEPTION 'INVALID_BILLING_FAMILY' USING ERRCODE='22023';END IF;
    INSERT INTO public.invoices(teacher_id,guardian_id,period_start,period_end,
      status,subtotal_cents,currency)
      VALUES(v_teacher,v_guardian,p_period_start,p_period_end,'draft',0,v_currency)
      RETURNING id INTO v_invoice;
    v_subtotal:=0;v_sort:=0;
    FOR v_line IN SELECT value FROM jsonb_array_elements(v_draft->'items') LOOP
      v_lesson:=(v_line->>'lessonId')::uuid;
      v_kind:=v_line->>'kind';
      v_description:=nullif(btrim(v_line->>'description'),'');
      v_qty:=(v_line->>'quantity')::integer;
      v_unit:=(v_line->>'unitCents')::integer;
      v_amount:=(v_line->>'amountCents')::integer;
      IF v_lesson IS NULL OR v_kind NOT IN ('lesson','travel') OR
        v_description IS NULL OR length(v_description)>500 OR
        v_qty NOT BETWEEN 1 AND 10000 OR v_unit NOT BETWEEN 0 AND 100000000 OR
        v_amount NOT BETWEEN 0 AND 100000000 OR
        v_qty::bigint*v_unit<>v_amount
      THEN RAISE EXCEPTION 'INVALID_BILLING_LINE' USING ERRCODE='22023';END IF;
      PERFORM 1 FROM public.lessons l JOIN public.students s
        ON s.id=l.student_id AND s.teacher_id=v_teacher
        WHERE l.id=v_lesson AND l.teacher_id=v_teacher
          AND s.guardian_id=v_guardian
          AND l.lesson_date BETWEEN p_period_start AND p_period_end
        FOR NO KEY UPDATE OF l;
      IF NOT FOUND THEN RAISE EXCEPTION 'LESSON_OR_FAMILY_NOT_FOUND'
        USING ERRCODE='42501';END IF;
      IF EXISTS(SELECT 1 FROM public.invoice_items ii
        JOIN public.invoices i ON i.id=ii.invoice_id
        WHERE ii.lesson_id=v_lesson AND ii.kind=v_kind
          AND i.teacher_id=v_teacher AND i.status<>'void') THEN
        RAISE EXCEPTION 'INVOICE_ALREADY_COMMITTED' USING ERRCODE='23505';
      END IF;
      INSERT INTO public.invoice_items(invoice_id,lesson_id,kind,description,
        quantity,unit_cents,amount_cents,sort_order)
        VALUES(v_invoice,v_lesson,v_kind,v_description,v_qty,v_unit,v_amount,v_sort);
      v_subtotal:=v_subtotal+v_amount;
      v_sort:=v_sort+1;
    END LOOP;
    IF v_subtotal>2147483647 THEN
      RAISE EXCEPTION 'INVOICE_SUBTOTAL_OVERFLOW' USING ERRCODE='22003';
    END IF;
    UPDATE public.invoices SET subtotal_cents=v_subtotal::integer WHERE id=v_invoice;
    v_created:=v_created||jsonb_build_array(v_invoice);
    v_count:=v_count+1;
  END LOOP;
  v_receipt:=jsonb_build_object('created',v_created,'count',v_count,
    'creditsUsed',v_credits,'periodStart',p_period_start,'periodEnd',p_period_end,
    'idempotencyKey',p_request_id,'replayed',false);
  UPDATE public.agent_tool_receipts SET receipt=v_receipt
    WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
  RETURN v_receipt;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_invoice_generation_commit(
 date,date,jsonb,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_invoice_generation_commit(
 date,date,jsonb,jsonb,uuid) TO authenticated;

-- Read-only idempotent replay runs BEFORE re-deriving the changing billing
-- period. The hashed request identity is period + teacher, not a stale
-- generated invoice draft. Receipt lookup cannot access other teachers.
CREATE OR REPLACE FUNCTION public.ccp_invoice_generation_receipt(
 p_period_start date,p_period_end date,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $generation_receipt$
DECLARE
 v_teacher uuid:=auth.uid();
 v_saved public.agent_tool_receipts%ROWTYPE;
 v_hash text;
BEGIN
 IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_period_start IS NULL OR p_period_end IS NULL THEN
   RAISE EXCEPTION 'INVALID_BILLING_REQUEST' USING ERRCODE='22023';END IF;
 SELECT * INTO v_saved FROM public.agent_tool_receipts
   WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
 IF NOT FOUND THEN RETURN NULL;END IF;
 v_hash:=md5(jsonb_build_array('billing.generation.commit',p_period_start,p_period_end)::text);
 IF v_saved.operation<>'billing.generation.commit' OR
   v_saved.request_hash<>v_hash THEN
   RAISE EXCEPTION 'BILLING_GENERATION_REQUEST_CONFLICT' USING ERRCODE='23505';
 END IF;
 RETURN v_saved.receipt||jsonb_build_object('replayed',true);
END;
$generation_receipt$;
REVOKE ALL ON FUNCTION public.ccp_invoice_generation_receipt(
 date,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_invoice_generation_receipt(
 date,date,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ccp_invoice_regenerate_atomic(
 p_invoice_id uuid,p_items jsonb,p_redemptions jsonb,
 p_expected_updated_at timestamptz,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid:=auth.uid();
  v_invoice public.invoices%ROWTYPE;
  v_line jsonb;v_credit jsonb;v_lesson uuid;v_package uuid;
  v_kind text;v_description text;v_qty integer;v_unit integer;v_amount integer;
  v_subtotal bigint:=0;v_sort integer:=0;
  v_hash text;v_prior public.agent_tool_receipts%ROWTYPE;v_receipt jsonb;
  v_updated timestamptz;
BEGIN
  IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';END IF;
  IF p_request_id IS NULL OR p_expected_updated_at IS NULL OR
    jsonb_typeof(p_items)<>'array' OR jsonb_typeof(p_redemptions)<>'array'
    OR jsonb_array_length(p_items)>2000 OR jsonb_array_length(p_redemptions)>2000
  THEN RAISE EXCEPTION 'INVALID_REGENERATION_INPUT' USING ERRCODE='22023';END IF;
  PERFORM 1 FROM public.teachers WHERE id=v_teacher FOR UPDATE;
  v_hash:=md5(jsonb_build_array('billing.invoice.regenerate',
    p_invoice_id,p_expected_updated_at)::text);
  INSERT INTO public.agent_tool_receipts(
    teacher_id,idempotency_key,operation,request_hash,receipt
  ) VALUES(v_teacher,p_request_id,'billing.invoice.regenerate',v_hash,'{}'::jsonb)
    ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO v_prior FROM public.agent_tool_receipts
      WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
    IF NOT FOUND OR v_prior.operation<>'billing.invoice.regenerate' OR
      v_prior.request_hash<>v_hash THEN
      RAISE EXCEPTION 'INVOICE_REGENERATION_REQUEST_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN v_prior.receipt||jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO v_invoice FROM public.invoices
    WHERE id=p_invoice_id AND teacher_id=v_teacher FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';END IF;
  IF v_invoice.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'STALE_INVOICE_REVISION' USING ERRCODE='23505';
  END IF;
  IF v_invoice.status<>'draft' OR EXISTS(
    SELECT 1 FROM public.credit_packages WHERE invoice_id=p_invoice_id
  ) OR EXISTS(SELECT 1 FROM public.payments WHERE invoice_id=p_invoice_id)
    -- Never mutate a draft with a live or unreconciled Stripe checkout link:
    -- the family might still pay the amount shown in that older link.
    OR v_invoice.stripe_checkout_session_id IS NOT NULL
    OR v_invoice.stripe_checkout_url IS NOT NULL
    OR v_invoice.stripe_payment_intent_id IS NOT NULL
  THEN RAISE EXCEPTION 'INVOICE_REGENERATION_BLOCKED' USING ERRCODE='23514';END IF;
  DELETE FROM public.invoice_items WHERE invoice_id=p_invoice_id;
  FOR v_credit IN SELECT value FROM jsonb_array_elements(p_redemptions) LOOP
    v_lesson:=(v_credit->>'lessonId')::uuid;
    v_package:=(v_credit->>'packageId')::uuid;
    IF v_lesson IS NULL OR v_package IS NULL THEN
      RAISE EXCEPTION 'INVALID_CREDIT_ALLOCATION' USING ERRCODE='22023';END IF;
    INSERT INTO public.credit_redemptions(teacher_id,lesson_id,package_id)
      VALUES(v_teacher,v_lesson,v_package);
  END LOOP;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_lesson:=(v_line->>'lessonId')::uuid;
    v_kind:=v_line->>'kind';
    v_description:=nullif(btrim(v_line->>'description'),'');
    v_qty:=(v_line->>'quantity')::integer;
    v_unit:=(v_line->>'unitCents')::integer;
    v_amount:=(v_line->>'amountCents')::integer;
    IF v_lesson IS NULL OR v_kind NOT IN ('lesson','travel') OR
      v_description IS NULL OR length(v_description)>500 OR
      v_qty NOT BETWEEN 1 AND 10000 OR v_unit NOT BETWEEN 0 AND 100000000
      OR v_amount NOT BETWEEN 0 AND 100000000 OR v_qty::bigint*v_unit<>v_amount
    THEN RAISE EXCEPTION 'INVALID_REGENERATION_LINE' USING ERRCODE='22023';END IF;
    PERFORM 1 FROM public.lessons l JOIN public.students s
      ON s.id=l.student_id AND s.teacher_id=v_teacher
      WHERE l.id=v_lesson AND l.teacher_id=v_teacher
        AND s.guardian_id=v_invoice.guardian_id
        AND l.lesson_date BETWEEN v_invoice.period_start AND v_invoice.period_end
      FOR NO KEY UPDATE OF l;
    IF NOT FOUND THEN RAISE EXCEPTION 'LESSON_OR_FAMILY_NOT_FOUND'
      USING ERRCODE='42501';END IF;
    IF EXISTS(SELECT 1 FROM public.invoice_items ii
      JOIN public.invoices i ON i.id=ii.invoice_id
      WHERE ii.lesson_id=v_lesson AND ii.kind=v_kind
        AND i.teacher_id=v_teacher AND i.status<>'void') THEN
      RAISE EXCEPTION 'INVOICE_ALREADY_COMMITTED' USING ERRCODE='23505';
    END IF;
    INSERT INTO public.invoice_items(invoice_id,lesson_id,kind,description,
      quantity,unit_cents,amount_cents,sort_order)
      VALUES(p_invoice_id,v_lesson,v_kind,v_description,v_qty,v_unit,v_amount,v_sort);
    v_subtotal:=v_subtotal+v_amount;v_sort:=v_sort+1;
  END LOOP;
  IF v_subtotal>2147483647 THEN
    RAISE EXCEPTION 'INVOICE_SUBTOTAL_OVERFLOW' USING ERRCODE='22003';END IF;
  UPDATE public.invoices SET subtotal_cents=v_subtotal::integer
    WHERE id=p_invoice_id RETURNING updated_at INTO v_updated;
  v_receipt:=jsonb_build_object('ok',true,'invoiceId',p_invoice_id,
    'itemCount',v_sort,'subtotalCents',v_subtotal::integer,
    'updatedAt',v_updated,'idempotencyKey',p_request_id,'replayed',false);
  UPDATE public.agent_tool_receipts SET receipt=v_receipt
    WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
  RETURN v_receipt;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_invoice_regenerate_atomic(
 uuid,jsonb,jsonb,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_invoice_regenerate_atomic(
 uuid,jsonb,jsonb,timestamptz,uuid) TO authenticated;

-- A repeated model/web request can retrieve its immutable receipt even when
-- the earlier operation already changed the invoice and invoice totals.
CREATE OR REPLACE FUNCTION public.ccp_invoice_regeneration_receipt(
 p_invoice_id uuid,p_expected_updated_at timestamptz,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $regeneration_receipt$
DECLARE
 v_teacher uuid:=auth.uid();
 v_saved public.agent_tool_receipts%ROWTYPE;
 v_hash text;
BEGIN
 IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_invoice_id IS NULL OR p_expected_updated_at IS NULL THEN
   RAISE EXCEPTION 'INVALID_REGENERATION_REQUEST' USING ERRCODE='22023';END IF;
 SELECT * INTO v_saved FROM public.agent_tool_receipts
   WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
 IF NOT FOUND THEN RETURN NULL;END IF;
 v_hash:=md5(jsonb_build_array('billing.invoice.regenerate',
   p_invoice_id,p_expected_updated_at)::text);
 IF v_saved.operation<>'billing.invoice.regenerate' OR
   v_saved.request_hash<>v_hash THEN
   RAISE EXCEPTION 'INVOICE_REGENERATION_REQUEST_CONFLICT' USING ERRCODE='23505';
 END IF;
 RETURN v_saved.receipt||jsonb_build_object('replayed',true);
END;
$regeneration_receipt$;
REVOKE ALL ON FUNCTION public.ccp_invoice_regeneration_receipt(
 uuid,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_invoice_regeneration_receipt(
 uuid,timestamptz,uuid) TO authenticated;

-- Durable coach-attested chess goals, rating snapshots and profile
-- corrections. Website and MCP both use the same student update service;
-- this database trigger captures history even for otherwise direct RLS writes.
ALTER TABLE public.students
 ADD COLUMN IF NOT EXISTS chess_goals text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS chess_ratings jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.students
 ADD CONSTRAINT ccp_student_chess_goals_length CHECK(length(chess_goals)<=5000),
 ADD CONSTRAINT ccp_student_chess_ratings_map CHECK(jsonb_typeof(chess_ratings)='object');

CREATE TABLE public.student_chess_profile_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 teacher_id uuid NOT NULL REFERENCES public.teachers(id),
 student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
 field_name text NOT NULL CHECK(field_name IN (
   'strength','chess_goals','lichess_username','chesscom_username',
   'lichess_rating','chesscom_rating','chess_ratings'
 )),
 previous_value jsonb,
 next_value jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ccp_chess_profile_history_student
 ON public.student_chess_profile_history(teacher_id,student_id,created_at DESC,id DESC);
ALTER TABLE public.student_chess_profile_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY ccp_chess_profile_history_owner ON public.student_chess_profile_history
 FOR SELECT TO authenticated USING(teacher_id=auth.uid());
REVOKE ALL ON public.student_chess_profile_history FROM anon,PUBLIC;
GRANT SELECT ON public.student_chess_profile_history TO authenticated;

CREATE OR REPLACE FUNCTION public.ccp_student_chess_history_capture()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.teacher_id<>OLD.teacher_id THEN
   RAISE EXCEPTION 'STUDENT_OWNER_CANNOT_CHANGE' USING ERRCODE='42501';
 END IF;
 IF NEW.strength IS DISTINCT FROM OLD.strength THEN
   INSERT INTO public.student_chess_profile_history
    (teacher_id,student_id,field_name,previous_value,next_value)
   VALUES(NEW.teacher_id,NEW.id,'strength',to_jsonb(OLD.strength),to_jsonb(NEW.strength));
 END IF;
 IF NEW.chess_goals IS DISTINCT FROM OLD.chess_goals THEN
   INSERT INTO public.student_chess_profile_history
    (teacher_id,student_id,field_name,previous_value,next_value)
   VALUES(NEW.teacher_id,NEW.id,'chess_goals',to_jsonb(OLD.chess_goals),to_jsonb(NEW.chess_goals));
 END IF;
 IF NEW.lichess_username IS DISTINCT FROM OLD.lichess_username THEN
   INSERT INTO public.student_chess_profile_history
    (teacher_id,student_id,field_name,previous_value,next_value)
   VALUES(NEW.teacher_id,NEW.id,'lichess_username',to_jsonb(OLD.lichess_username),to_jsonb(NEW.lichess_username));
 END IF;
 IF NEW.chesscom_username IS DISTINCT FROM OLD.chesscom_username THEN
   INSERT INTO public.student_chess_profile_history
    (teacher_id,student_id,field_name,previous_value,next_value)
   VALUES(NEW.teacher_id,NEW.id,'chesscom_username',to_jsonb(OLD.chesscom_username),to_jsonb(NEW.chesscom_username));
 END IF;
 IF NEW.lichess_rating IS DISTINCT FROM OLD.lichess_rating THEN
   INSERT INTO public.student_chess_profile_history
    (teacher_id,student_id,field_name,previous_value,next_value)
   VALUES(NEW.teacher_id,NEW.id,'lichess_rating',to_jsonb(OLD.lichess_rating),to_jsonb(NEW.lichess_rating));
 END IF;
 IF NEW.chesscom_rating IS DISTINCT FROM OLD.chesscom_rating THEN
   INSERT INTO public.student_chess_profile_history
    (teacher_id,student_id,field_name,previous_value,next_value)
   VALUES(NEW.teacher_id,NEW.id,'chesscom_rating',to_jsonb(OLD.chesscom_rating),to_jsonb(NEW.chesscom_rating));
 END IF;
 IF NEW.chess_ratings IS DISTINCT FROM OLD.chess_ratings THEN
   INSERT INTO public.student_chess_profile_history
    (teacher_id,student_id,field_name,previous_value,next_value)
   VALUES(NEW.teacher_id,NEW.id,'chess_ratings',OLD.chess_ratings,NEW.chess_ratings);
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER ccp_student_chess_history
 AFTER UPDATE OF strength,chess_goals,chess_ratings,lichess_username,
  chesscom_username,lichess_rating,chesscom_rating ON public.students
 FOR EACH ROW EXECUTE FUNCTION public.ccp_student_chess_history_capture();

-- Explicit teacher-selected default studies for workplaces and optional groups.
-- A default link is NOT evidence that students were taught that material.
-- Revisions and retirement are recorded, never silently rewrite history.
CREATE TABLE public.chess_material_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id),
  workplace_id uuid NOT NULL REFERENCES public.workplaces(id),
  group_id uuid REFERENCES public.class_groups(id),
  label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 160),
  url text NOT NULL CHECK(length(url)<=500),
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
  request_id uuid NOT NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(teacher_id,request_id)
);
CREATE INDEX ccp_material_defaults_scope
 ON public.chess_material_defaults(teacher_id,workplace_id,group_id,archived_at);
ALTER TABLE public.chess_material_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY ccp_material_defaults_teacher ON public.chess_material_defaults
 FOR ALL TO authenticated
 USING(teacher_id=auth.uid()) WITH CHECK(teacher_id=auth.uid());
REVOKE ALL ON public.chess_material_defaults FROM anon,PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.chess_material_defaults TO authenticated;

CREATE TABLE public.chess_material_default_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id),
  default_id uuid NOT NULL REFERENCES public.chess_material_defaults(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK(action IN ('created','updated','archived')),
  before_value jsonb,
  after_value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ccp_material_default_history_scope
 ON public.chess_material_default_history(teacher_id,default_id,created_at DESC);
ALTER TABLE public.chess_material_default_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY ccp_material_default_history_teacher ON public.chess_material_default_history
 FOR SELECT TO authenticated USING(teacher_id=auth.uid());
REVOKE ALL ON public.chess_material_default_history FROM anon,PUBLIC;
GRANT SELECT ON public.chess_material_default_history TO authenticated;

CREATE OR REPLACE FUNCTION public.ccp_chess_material_default_validate()
 RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
   IF (NEW.id,NEW.teacher_id,NEW.workplace_id,NEW.group_id,NEW.request_id,NEW.created_at)
     IS DISTINCT FROM
      (OLD.id,OLD.teacher_id,OLD.workplace_id,OLD.group_id,OLD.request_id,OLD.created_at)
   THEN RAISE EXCEPTION 'DEFAULT_SCOPE_IMMUTABLE' USING ERRCODE='23514';END IF;
   IF OLD.archived_at IS NOT NULL THEN
     RAISE EXCEPTION 'DEFAULT_ALREADY_ARCHIVED' USING ERRCODE='23514';
   END IF;
   NEW.updated_at:=clock_timestamp();
 END IF;
 IF NEW.url !~ '^https://lichess[.]org/study/[A-Za-z0-9]{8}(/[A-Za-z0-9]{8})?/?$' THEN
   RAISE EXCEPTION 'INVALID_STUDY_URL' USING ERRCODE='22023';
 END IF;
 PERFORM 1 FROM public.workplaces WHERE id=NEW.workplace_id
   AND teacher_id=NEW.teacher_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'DEFAULT_WORKPLACE_NOT_FOUND'
   USING ERRCODE='42501';END IF;
 IF NEW.group_id IS NOT NULL THEN
   PERFORM 1 FROM public.class_groups WHERE id=NEW.group_id
     AND workplace_id=NEW.workplace_id AND teacher_id=NEW.teacher_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'DEFAULT_GROUP_WORKPLACE_MISMATCH'
     USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER ccp_material_default_validate
 BEFORE INSERT OR UPDATE ON public.chess_material_defaults
 FOR EACH ROW EXECUTE FUNCTION public.ccp_chess_material_default_validate();

CREATE OR REPLACE FUNCTION public.ccp_chess_material_default_audit()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_action text;
BEGIN
 IF TG_OP='INSERT' THEN
   v_action:='created';
 ELSE
   IF (OLD.label,OLD.url,OLD.notes,OLD.archived_at)
      IS NOT DISTINCT FROM (NEW.label,NEW.url,NEW.notes,NEW.archived_at) THEN
     RETURN NEW;
   END IF;
   v_action:=CASE WHEN NEW.archived_at IS NOT NULL THEN 'archived' ELSE 'updated' END;
 END IF;
 INSERT INTO public.chess_material_default_history
   (teacher_id,default_id,action,before_value,after_value)
 VALUES(NEW.teacher_id,NEW.id,v_action,
   CASE WHEN TG_OP='INSERT' THEN NULL
     ELSE jsonb_build_object('label',OLD.label,'url',OLD.url,'notes',OLD.notes,
       'archivedAt',OLD.archived_at) END,
   jsonb_build_object('label',NEW.label,'url',NEW.url,'notes',NEW.notes,
     'archivedAt',NEW.archived_at));
 RETURN NEW;
END;
$$;
CREATE TRIGGER ccp_material_default_audit
 AFTER INSERT OR UPDATE ON public.chess_material_defaults
 FOR EACH ROW EXECUTE FUNCTION public.ccp_chess_material_default_audit();

-- Record an authenticated prepaid-credit return and its replay receipt in the
-- SAME PostgreSQL transaction. Concurrent website/MCP retries must not return
-- an error after the first legitimate delete or accidentally restore/consume
-- a credit again. A different teacher must not discover an ID through receipts.
CREATE TABLE public.ccp_credit_redemption_return_receipts (
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  redemption_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, redemption_id)
);
ALTER TABLE public.ccp_credit_redemption_return_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ccp_credit_redemption_return_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ccp_credit_redemption_return_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.ccp_credit_redemption_return(
  p_redemption_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid := auth.uid();
  v_deleted uuid;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF p_redemption_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_REDEMPTION_ID' USING ERRCODE='22023';
  END IF;

  -- All returns for one teacher serialize, including cross-client retries.
  -- If the transaction rolls back, its delete AND receipt roll back together.
  PERFORM 1 FROM public.teachers WHERE id=v_teacher FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';
  END IF;

  DELETE FROM public.credit_redemptions
    WHERE id=p_redemption_id AND teacher_id=v_teacher
    RETURNING id INTO v_deleted;
  IF FOUND THEN
    INSERT INTO public.ccp_credit_redemption_return_receipts
      (teacher_id, redemption_id)
    VALUES (v_teacher, v_deleted);
    RETURN jsonb_build_object('ok',true,'replayed',false);
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.ccp_credit_redemption_return_receipts
    WHERE teacher_id=v_teacher AND redemption_id=p_redemption_id
  ) THEN
    RETURN jsonb_build_object('ok',true,'replayed',true);
  END IF;

  RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_credit_redemption_return(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_credit_redemption_return(uuid) TO authenticated;

-- Explicit, revision-checked correction of a frozen teaching-session roster.
-- The original roster and removed attendance evidence are preserved in an
-- append-only, owner-scoped audit. Corrections affecting attached chess
-- observations/materials are refused instead of silently deleting teaching
-- evidence. Both website and MCP use this exact authenticated transaction.

CREATE TABLE public.session_roster_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  request_id uuid NOT NULL,
  previous_students jsonb NOT NULL,
  corrected_students jsonb NOT NULL,
  removed_attendance jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (session_id,teacher_id) REFERENCES public.teaching_sessions(id,teacher_id) ON DELETE CASCADE,
  UNIQUE (teacher_id, request_id),
  CONSTRAINT roster_correction_reason_chk CHECK (char_length(btrim(reason)) BETWEEN 8 AND 1000),
  CONSTRAINT roster_correction_students_chk CHECK (
    jsonb_typeof(previous_students)='array' AND jsonb_typeof(corrected_students)='array'
    AND jsonb_typeof(removed_attendance)='array'
  )
);
ALTER TABLE public.session_roster_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY session_roster_corrections_read_own
 ON public.session_roster_corrections FOR SELECT TO authenticated
 USING (teacher_id=auth.uid());
REVOKE ALL ON public.session_roster_corrections FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.session_roster_corrections TO authenticated;
GRANT ALL ON public.session_roster_corrections TO service_role;

CREATE OR REPLACE FUNCTION public.ccp_session_roster_correct(
 p_session_id uuid,
 p_student_ids uuid[],
 p_expected_updated_at timestamptz,
 p_request_id uuid,
 p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_teacher uuid:=auth.uid();
 v_session public.teaching_sessions%ROWTYPE;
 v_before uuid[];v_after uuid[];v_removed uuid[];v_added uuid[];
 v_removed_attendance jsonb;
 v_hash text;v_saved public.agent_tool_receipts%ROWTYPE;
 v_updated timestamptz;v_audit_id uuid;v_receipt jsonb;
BEGIN
 IF v_teacher IS NULL THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
 END IF;
 IF p_session_id IS NULL OR p_expected_updated_at IS NULL
   OR p_request_id IS NULL OR p_student_ids IS NULL
   OR cardinality(p_student_ids) NOT BETWEEN 1 AND 100
   OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 8 AND 1000
   OR array_position(p_student_ids,NULL) IS NOT NULL
 THEN
   RAISE EXCEPTION 'INVALID_ROSTER_CORRECTION' USING ERRCODE='22023';
 END IF;

 v_after:=ARRAY(SELECT x FROM unnest(p_student_ids) AS x ORDER BY x);
 IF (SELECT count(DISTINCT x) FROM unnest(v_after) AS x)<>cardinality(v_after) THEN
   RAISE EXCEPTION 'DUPLICATE_ROSTER_STUDENT' USING ERRCODE='22023';
 END IF;

 -- Lock the tenant so concurrent browser/MCP writes cannot interleave roster
 -- and attendance changes. Replayed IDs return their original receipt.
 PERFORM 1 FROM public.teachers WHERE id=v_teacher FOR UPDATE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';
 END IF;
 v_hash:=md5(jsonb_build_array(
   'session.roster.correct',p_session_id,to_jsonb(v_after),
   p_expected_updated_at,p_reason)::text);
 INSERT INTO public.agent_tool_receipts(
   teacher_id,idempotency_key,operation,request_hash,receipt
 ) VALUES(v_teacher,p_request_id,'session.roster.correct',v_hash,'{}'::jsonb)
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN
   SELECT * INTO v_saved FROM public.agent_tool_receipts
   WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
   IF NOT FOUND OR v_saved.operation<>'session.roster.correct'
     OR v_saved.request_hash<>v_hash THEN
     RAISE EXCEPTION 'ROSTER_REPLAY_CONFLICT' USING ERRCODE='23505';
   END IF;
   RETURN v_saved.receipt;
 END IF;

 SELECT * INTO v_session FROM public.teaching_sessions
 WHERE id=p_session_id AND teacher_id=v_teacher FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';END IF;
 IF v_session.updated_at IS DISTINCT FROM p_expected_updated_at THEN
   RAISE EXCEPTION 'ROSTER_REVISION_CONFLICT' USING ERRCODE='23505';
 END IF;
 IF v_session.student_id IS NOT NULL
   AND NOT v_session.student_id=ANY(v_after) THEN
   RAISE EXCEPTION 'PRIVATE_LESSON_STUDENT_REQUIRED' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM unnest(v_after) AS x
   WHERE NOT EXISTS(
     SELECT 1 FROM public.students s
     WHERE s.id=x AND s.teacher_id=v_teacher
   )) THEN
   RAISE EXCEPTION 'ROSTER_STUDENT_NOT_FOUND' USING ERRCODE='42501';
 END IF;

 v_before:=ARRAY(SELECT student_id FROM public.session_participants
   WHERE session_id=p_session_id AND teacher_id=v_teacher ORDER BY student_id);
 v_removed:=ARRAY(SELECT x FROM unnest(v_before) AS x
   WHERE NOT x=ANY(v_after));
 v_added:=ARRAY(SELECT x FROM unnest(v_after) AS x
   WHERE NOT x=ANY(v_before));
 IF cardinality(v_removed)=0 AND cardinality(v_added)=0 THEN
   RAISE EXCEPTION 'ROSTER_UNCHANGED' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM public.chess_observations o
   WHERE o.teacher_id=v_teacher AND o.session_id=p_session_id
     AND o.student_id=ANY(v_removed))
   OR EXISTS(SELECT 1 FROM public.material_links r
   WHERE r.teacher_id=v_teacher AND r.session_id=p_session_id
     AND r.student_id=ANY(v_removed)) THEN
   RAISE EXCEPTION 'ROSTER_HAS_LINKED_CHESS_EVIDENCE' USING ERRCODE='23514';
 END IF;

 -- The only deleted session-attendance rows are captured in the audit with
 -- their original status, notes and timestamps; historical lesson records
 -- and the parent session itself remain unchanged.
 SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.student_id),'[]'::jsonb)
 INTO v_removed_attendance
 FROM public.session_attendance a
 WHERE a.teacher_id=v_teacher AND a.session_id=p_session_id
   AND a.student_id=ANY(v_removed);

 DELETE FROM public.session_attendance
 WHERE teacher_id=v_teacher AND session_id=p_session_id
   AND student_id=ANY(v_removed);
 DELETE FROM public.session_participants
 WHERE teacher_id=v_teacher AND session_id=p_session_id
   AND student_id=ANY(v_removed);

 INSERT INTO public.session_participants(teacher_id,session_id,student_id)
 SELECT v_teacher,p_session_id,x FROM unnest(v_added) AS x;
 -- New members begin without an attendance decision row.

 UPDATE public.teaching_sessions SET updated_at=clock_timestamp()
 WHERE id=p_session_id AND teacher_id=v_teacher
 RETURNING updated_at INTO v_updated;
 INSERT INTO public.session_roster_corrections(
   teacher_id,session_id,request_id,previous_students,corrected_students,
   removed_attendance,reason
 ) VALUES(
   v_teacher,p_session_id,p_request_id,to_jsonb(v_before),to_jsonb(v_after),
   v_removed_attendance,btrim(p_reason)
 ) RETURNING id INTO v_audit_id;
 v_receipt:=jsonb_build_object(
   'ok',true,'sessionId',p_session_id,'updatedAt',v_updated,
   'auditId',v_audit_id,'addedStudentIds',to_jsonb(v_added),
   'removedStudentIds',to_jsonb(v_removed)
 );
 UPDATE public.agent_tool_receipts SET receipt=v_receipt
 WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
 RETURN v_receipt;
END;
$$;

REVOKE ALL ON FUNCTION public.ccp_session_roster_correct(
 uuid,uuid[],timestamptz,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_session_roster_correct(
 uuid,uuid[],timestamptz,uuid,text) TO authenticated;

-- Ordinary teacher edits must not destroy chess assessment history by FK cascade.
-- Service-role privacy/account erasure remains a separate, controlled operation.
CREATE OR REPLACE FUNCTION public.ccp_protect_skill_assessment_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() = OLD.teacher_id AND EXISTS (
    SELECT 1 FROM public.skill_assessments WHERE dimension_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Skill dimension has historical ratings; rename it instead'
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_protect_skill_assessment_history() FROM PUBLIC;
DROP TRIGGER IF EXISTS ccp_protect_skill_assessment_history ON public.skill_dimensions;
CREATE TRIGGER ccp_protect_skill_assessment_history
BEFORE DELETE ON public.skill_dimensions
FOR EACH ROW EXECUTE FUNCTION public.ccp_protect_skill_assessment_history();

-- One chess skill-assessment round is one teacher-owned, retry-safe transaction.
-- Retry receipts are private to an authenticated teacher. Historical ratings
-- remain append-only; one UUID cannot mean two different payloads.
CREATE TABLE IF NOT EXISTS public.skill_assessment_write_receipts (
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  student_id uuid NOT NULL,
  payload jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(teacher_id,idempotency_key),
  CONSTRAINT skill_assessment_receipt_student_owner_fk
    FOREIGN KEY(student_id,teacher_id) REFERENCES public.students(id,teacher_id)
    ON DELETE CASCADE
);
ALTER TABLE public.skill_assessment_write_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.skill_assessment_write_receipts FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.ccp_skill_assessments_record(
  p_student_id uuid,p_assessed_on date,p_ratings jsonb,p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid:=auth.uid();
  v_payload jsonb;
  v_old_payload jsonb;v_old_result jsonb;
  v_item jsonb;v_dimension uuid;v_rating integer;v_note text;
  v_dimensions uuid[]:='{}'::uuid[];
  v_locked_count integer;v_record jsonb;
  v_result jsonb:='[]'::jsonb;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF p_student_id IS NULL OR p_assessed_on IS NULL OR p_request_id IS NULL OR
     jsonb_typeof(p_ratings) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'INVALID_ASSESSMENT' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_ratings) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'INVALID_ASSESSMENT_COUNT' USING ERRCODE='22023';
  END IF;

  -- Do not include today's date in the immutable request payload. An exact
  -- retry after teacher-local midnight must return the original dated rows.
  v_payload:=jsonb_build_object('studentId',p_student_id,'ratings',p_ratings);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_teacher::text||':skill-round:'||p_request_id::text,0));
  SELECT payload,result INTO v_old_payload,v_old_result
    FROM public.skill_assessment_write_receipts
    WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
  IF FOUND THEN
    IF v_old_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'SKILL_REQUEST_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN v_old_result;
  END IF;

  PERFORM 1 FROM public.students
    WHERE id=p_student_id AND teacher_id=v_teacher FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STUDENT_NOT_FOUND' USING ERRCODE='42501';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_ratings) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' OR
       jsonb_typeof(v_item->'dimensionId') IS DISTINCT FROM 'string' OR
       jsonb_typeof(v_item->'rating') IS DISTINCT FROM 'number' OR
       COALESCE(jsonb_typeof(v_item->'note'),'null') NOT IN ('string','null') THEN
      RAISE EXCEPTION 'INVALID_ASSESSMENT' USING ERRCODE='22023';
    END IF;
    v_dimension:=(v_item->>'dimensionId')::uuid;
    v_rating:=(v_item->>'rating')::integer;
    v_note:=nullif(btrim(v_item->>'note'),'');
    IF v_dimension IS NULL OR v_rating NOT BETWEEN 1 AND 5 OR
       length(v_note)>2000 OR v_dimension=ANY(v_dimensions) THEN
      RAISE EXCEPTION 'INVALID_ASSESSMENT_VALUE' USING ERRCODE='22023';
    END IF;
    v_dimensions:=array_append(v_dimensions,v_dimension);
  END LOOP;

  -- Lock the referenced dimensions before inserting to prevent concurrent
  -- deletion between owner check and the historical rating write.
  SELECT count(*) INTO v_locked_count FROM (
    SELECT id FROM public.skill_dimensions
      WHERE teacher_id=v_teacher AND id=ANY(v_dimensions)
      FOR KEY SHARE
  ) AS owned;
  IF v_locked_count<>jsonb_array_length(p_ratings) THEN
    RAISE EXCEPTION 'SKILL_DIMENSION_NOT_FOUND' USING ERRCODE='42501';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_ratings) LOOP
    v_dimension:=(v_item->>'dimensionId')::uuid;
    v_rating:=(v_item->>'rating')::integer;
    v_note:=nullif(btrim(v_item->>'note'),'');
    INSERT INTO public.skill_assessments(student_id,dimension_id,rating,note,assessed_on)
      VALUES(p_student_id,v_dimension,v_rating,v_note,p_assessed_on)
      RETURNING jsonb_build_object(
        'id',id,'dimension_id',dimension_id,'rating',rating,
        'note',note,'assessed_on',assessed_on,'created_at',created_at
      ) INTO v_record;
    v_result:=v_result||jsonb_build_array(v_record);
  END LOOP;

  INSERT INTO public.skill_assessment_write_receipts(
    teacher_id,idempotency_key,student_id,payload,result
  ) VALUES(v_teacher,p_request_id,p_student_id,v_payload,v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.ccp_skill_assessments_record(uuid,date,jsonb,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_skill_assessments_record(uuid,date,jsonb,uuid)
  TO authenticated;

-- Teacher-owned Lichess OAuth credentials are never selectable by browser or MCP
-- PostgreSQL roles; only authenticated server handlers use the service client.
-- The token is AES-256-GCM ciphertext, not an access token/plaintext.
CREATE TABLE IF NOT EXISTS public.teacher_lichess_connections (
  teacher_id uuid PRIMARY KEY REFERENCES public.teachers(id) ON DELETE CASCADE,
  lichess_username text NOT NULL CHECK (char_length(lichess_username) BETWEEN 1 AND 100),
  scopes text[] NOT NULL CHECK (
    array_length(scopes,1) BETWEEN 1 AND 2 AND
    scopes <@ ARRAY['study:read','study:write']::text[] AND
    'study:read'=ANY(scopes)
  ),
  token_ciphertext text NOT NULL CHECK (left(token_ciphertext,7)='enc.v1.'),
  token_sha256 text NOT NULL CHECK (length(token_sha256)=64),
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  previous_revoke_failed boolean NOT NULL DEFAULT false
);
ALTER TABLE public.teacher_lichess_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.teacher_lichess_connections FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.teacher_lichess_connection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  action text NOT NULL CHECK(action IN ('connected','reconnected','disconnected')),
  lichess_username text,
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  provider_revoked boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ccp_lichess_events_teacher_time
  ON public.teacher_lichess_connection_events(teacher_id,created_at DESC);
ALTER TABLE public.teacher_lichess_connection_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.teacher_lichess_connection_events FROM PUBLIC,anon,authenticated;

-- A prepaid package expiry change must never invalidate a lesson that already
-- consumed one of its credits. The package UPDATE row lock serializes with
-- enforce_credit_redemption_rules(), which locks the same package FOR UPDATE
-- before adding any new redemption. Protects direct SQL and both UI/MCP paths.
CREATE OR REPLACE FUNCTION public.ccp_protect_credit_expiry_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.expires_on IS NOT DISTINCT FROM OLD.expires_on THEN
    RETURN NEW;
  END IF;
  IF NEW.expires_on IS NOT NULL AND (
    NEW.expires_on < NEW.starts_on OR EXISTS (
      SELECT 1 FROM public.credit_redemptions r
      JOIN public.lessons l ON l.id=r.lesson_id
      WHERE r.package_id=OLD.id AND l.lesson_date>NEW.expires_on
    )
  ) THEN
    RAISE EXCEPTION 'CREDIT_EXPIRY_HISTORY_CONFLICT'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ccp_credit_expiry_history_guard ON public.credit_packages;
CREATE TRIGGER ccp_credit_expiry_history_guard
  BEFORE UPDATE OF expires_on ON public.credit_packages
  FOR EACH ROW EXECUTE FUNCTION public.ccp_protect_credit_expiry_history();

-- Verified teacher-approved Lichess puzzle imports get a durable at-most-once
-- publication receipt BEFORE the external provider request. Ambiguous provider
-- timeouts are never automatically repeated. One request ID and one exact
-- study+content hash cannot be published twice across the website and MCP.
CREATE TABLE public.lichess_puzzle_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  study_id text NOT NULL CHECK (study_id ~ '^[A-Za-z0-9]{8}$'),
  request_id uuid NOT NULL,
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  chapter_name text NOT NULL CHECK(length(chapter_name) BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'attempted'
    CHECK(status IN ('attempted','published','failed')),
  provider_chapter_id text CHECK(provider_chapter_id IS NULL OR provider_chapter_id ~ '^[A-Za-z0-9]{8}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE(teacher_id,request_id),
  UNIQUE(teacher_id,study_id,content_hash)
);
CREATE INDEX ccp_lichess_puzzle_publications_teacher
 ON public.lichess_puzzle_publications(teacher_id,created_at DESC);
ALTER TABLE public.lichess_puzzle_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY ccp_lichess_puzzle_publications_teacher
 ON public.lichess_puzzle_publications FOR ALL TO authenticated
 USING(teacher_id=auth.uid()) WITH CHECK(teacher_id=auth.uid());
REVOKE ALL ON public.lichess_puzzle_publications FROM anon,PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.lichess_puzzle_publications TO authenticated;

-- Backup restoration is one authenticated database transaction, not a
-- sequence of independently committed PostgREST table upserts. An invalid
-- dependent row, tenant/RLS violation or failed quota check rolls back ALL
-- earlier writes and the replay receipt, for both website and MCP callers.
CREATE TABLE public.teacher_backup_import_receipts (
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, digest)
);
ALTER TABLE public.teacher_backup_import_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY teacher_backup_receipts_owner ON public.teacher_backup_import_receipts
  FOR ALL TO authenticated USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());
REVOKE ALL ON public.teacher_backup_import_receipts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE(result) ON public.teacher_backup_import_receipts TO authenticated;

CREATE OR REPLACE FUNCTION public.ccp_teacher_backup_restore(
  p_tables jsonb, p_display_name text, p_digest text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE
  v_teacher uuid := auth.uid();
  v_table text;
  v_source jsonb;
  v_row jsonb;
  v_rows jsonb;
  v_columns text;
  v_updates text;
  v_pkeys text;
  v_count integer;
  v_updated integer;
  v_counts jsonb := '{}'::jsonb;
  v_result jsonb;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_tables) IS DISTINCT FROM 'object'
    OR p_digest !~ '^[a-f0-9]{64}$' OR p_digest IS NULL
    OR pg_column_size(p_tables) > 2097152 THEN
    RAISE EXCEPTION 'IMPORT_VALIDATION_ERROR' USING ERRCODE = '22023';
  END IF;

  -- Independent backups for the same teacher cannot interleave; the receipt
  -- insert also serializes concurrent retries of an identical approved digest.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_teacher::text, 0));
  INSERT INTO public.teacher_backup_import_receipts (teacher_id, digest, result)
  VALUES (v_teacher, p_digest, '{}'::jsonb) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT result INTO v_result FROM public.teacher_backup_import_receipts
    WHERE teacher_id = v_teacher AND digest = p_digest;
    IF v_result IS NULL THEN
      RAISE EXCEPTION 'IMPORT_RECEIPT_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_result;
  END IF;

  -- Match the portable backup's FK-safe ordering. The list is fixed in SQL;
  -- arbitrary JSON table names are ignored, never interpolated into SQL.
  FOREACH v_table IN ARRAY ARRAY[
    'studio_policies', 'guardians', 'students', 'workplaces', 'class_groups',
    'workplace_enrollments', 'group_enrollments', 'teaching_sessions',
    'session_participants', 'session_attendance', 'chess_skill_categories',
    'chess_observations', 'lesson_slots', 'lessons',
    'attendance', 'lesson_notes', 'skill_dimensions', 'skill_assessments',
    'invoices', 'invoice_items', 'payments', 'events', 'event_students',
    'event_rsvps', 'credit_packages', 'credit_redemptions'
  ] LOOP
    v_source := p_tables -> v_table;
    IF v_table = 'studio_policies' THEN
      IF v_source IS NULL OR v_source = 'null'::jsonb THEN
        v_rows := '[]'::jsonb;
      ELSIF jsonb_typeof(v_source) = 'object' THEN
        v_rows := jsonb_build_array(v_source);
      ELSE
        RAISE EXCEPTION 'IMPORT_INVALID_TABLE:%', v_table USING ERRCODE='22023';
      END IF;
    ELSIF v_source IS NULL THEN
      v_rows := '[]'::jsonb;
    ELSIF jsonb_typeof(v_source) = 'array' THEN
      v_rows := v_source;
    ELSE
      RAISE EXCEPTION 'IMPORT_INVALID_TABLE:%', v_table USING ERRCODE='22023';
    END IF;

    v_count := 0;
    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY key_cols.ordinality)
      INTO v_pkeys
    FROM pg_index i
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS key_cols(attnum, ordinality)
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = key_cols.attnum
    WHERE i.indrelid = format('public.%I', v_table)::regclass AND i.indisprimary;
    IF v_pkeys IS NULL THEN
      RAISE EXCEPTION 'IMPORT_UNSUPPORTED_TABLE:%', v_table USING ERRCODE='22023';
    END IF;

    FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
      IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'IMPORT_INVALID_ROW:%', v_table USING ERRCODE='22023';
      END IF;
      IF v_table = ANY(ARRAY[
        'studio_policies', 'guardians', 'students', 'workplaces', 'class_groups',
        'workplace_enrollments', 'group_enrollments', 'teaching_sessions',
        'session_participants', 'session_attendance', 'chess_skill_categories',
        'chess_observations', 'lesson_slots', 'lessons',
        'skill_dimensions', 'invoices', 'events', 'credit_packages',
        'credit_redemptions'
      ]) THEN
        v_row := jsonb_set(v_row, '{teacher_id}', to_jsonb(v_teacher::text), true);
      END IF;
      IF v_table = 'studio_policies' THEN
        v_row := v_row - 'stripe_secret_key' - 'stripe_publishable_key'
                 - 'stripe_webhook_secret' - 'ai_api_key';
      END IF;
      IF v_table = 'guardians'
        AND nullif(btrim(v_row ->> 'portal_token'), '') IS NULL THEN
        v_row := jsonb_set(v_row, '{portal_token}', to_jsonb(
          rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/', '-_'), '=')
        ), true);
      END IF;

      -- Insert only supplied columns so database defaults survive sparse
      -- portable exports. PostgreSQL performs the whole operation under RLS:
      -- a foreign owner's ID cannot be overwritten or attached via child FK.
      SELECT string_agg(format('%I', field), ', ' ORDER BY field),
             string_agg(format('%I = EXCLUDED.%I', field, field), ', ' ORDER BY field)
        INTO v_columns, v_updates
      FROM jsonb_object_keys(v_row) AS keys(field);
      IF v_columns IS NULL THEN
        RAISE EXCEPTION 'IMPORT_EMPTY_ROW:%', v_table USING ERRCODE='22023';
      END IF;
      EXECUTE format(
        'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) ON CONFLICT (%s) DO UPDATE SET %s',
        v_table, v_columns, v_columns, v_table, v_pkeys, v_updates
      ) USING v_row;
      v_count := v_count + 1;
    END LOOP;
    v_counts := jsonb_set(v_counts, ARRAY[v_table], to_jsonb(v_count), true);
  END LOOP;

  IF nullif(btrim(p_display_name), '') IS NOT NULL THEN
    UPDATE public.teachers SET display_name = btrim(p_display_name)
    WHERE id = v_teacher AND nullif(btrim(display_name), '') IS NULL;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 1 THEN
      v_counts := jsonb_set(v_counts, '{teacher_profile}', '1'::jsonb, true);
    END IF;
  END IF;
  v_result := jsonb_build_object('counts', v_counts);
  UPDATE public.teacher_backup_import_receipts SET result = v_result
  WHERE teacher_id = v_teacher AND digest = p_digest;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_teacher_backup_restore(jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ccp_teacher_backup_restore(jsonb, text, text) TO authenticated;

-- Every website/MCP family + member mutation is one owner-scoped transaction.
-- Previously a successful guardian insert could survive failed student creation,
-- or a partial member reassignment could detach only some students.
-- Direct RPC calls are also validated: no arbitrary owner or foreign student IDs.
CREATE OR REPLACE FUNCTION public.ccp_guardian_save(
  p_guardian_id uuid,
  p_fields jsonb,
  p_student_ids uuid[],
  p_replace_members boolean,
  p_new_students jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid := auth.uid();
  v_guardian public.guardians%ROWTYPE;
  v_name text;
  v_new jsonb;
  v_existing_ids integer;
  v_assigned integer;
  v_prior_guardians uuid[];
  v_old uuid;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_fields) IS DISTINCT FROM 'object'
     OR pg_column_size(p_fields)>16384
     OR EXISTS (
       SELECT 1 FROM jsonb_each(p_fields) AS f
       WHERE f.key NOT IN (
         'name','family_name','email','phone','secondary_name',
         'secondary_email','secondary_phone','email_recipients'
       ) OR (f.value<>'null'::jsonb AND jsonb_typeof(f.value)<>'string')
     )
     OR jsonb_typeof(p_new_students) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_new_students)>50 THEN
    RAISE EXCEPTION 'GUARDIAN_INVALID_INPUT' USING ERRCODE='22023';
  END IF;
  IF p_fields ? 'name' THEN
    v_name:=btrim(p_fields->>'name');
    IF v_name IS NULL OR length(v_name) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'GUARDIAN_INVALID_NAME' USING ERRCODE='22023';
    END IF;
  END IF;
  IF p_fields ? 'email_recipients' AND
     p_fields->>'email_recipients' NOT IN ('primary','secondary','both') THEN
    RAISE EXCEPTION 'GUARDIAN_INVALID_RECIPIENTS' USING ERRCODE='22023';
  END IF;
  -- Serializes concurrent family changes and student capacity reservations.
  -- No elevated UPDATE rights on teachers are required here. Existing
  -- student-capacity triggers serialize inserts on the teacher row, while
  -- family/event rows and PostgreSQL foreign keys protect their own writes.
  PERFORM 1 FROM public.teachers WHERE id=v_teacher;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;

  -- Validate the complete replacement roster before creating or editing it.
  IF p_replace_members THEN
    IF p_student_ids IS NULL OR cardinality(p_student_ids)>200
       OR cardinality(p_student_ids) <> (
         SELECT count(DISTINCT x) FROM unnest(p_student_ids) AS x
       ) THEN
      RAISE EXCEPTION 'GUARDIAN_INVALID_ROSTER' USING ERRCODE='22023';
    END IF;
    SELECT count(*) INTO v_existing_ids FROM public.students
      WHERE teacher_id=v_teacher AND id=ANY(p_student_ids);
    IF v_existing_ids<>cardinality(p_student_ids) THEN
      RAISE EXCEPTION 'GUARDIAN_STUDENT_NOT_FOUND' USING ERRCODE='42501';
    END IF;
  END IF;

  IF p_guardian_id IS NULL THEN
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'GUARDIAN_INVALID_NAME' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.guardians (
      teacher_id,name,family_name,email,phone,secondary_name,
      secondary_email,secondary_phone,email_recipients,portal_token
    ) VALUES (
      v_teacher,v_name,nullif(btrim(p_fields->>'family_name'),''),
      nullif(btrim(p_fields->>'email'),''),
      nullif(btrim(p_fields->>'phone'),''),
      nullif(btrim(p_fields->>'secondary_name'),''),
      nullif(btrim(p_fields->>'secondary_email'),''),
      nullif(btrim(p_fields->>'secondary_phone'),''),
      coalesce(p_fields->>'email_recipients','primary'),
      encode(extensions.gen_random_bytes(24),'hex')
    ) RETURNING * INTO v_guardian;
  ELSE
    SELECT * INTO v_guardian FROM public.guardians
      WHERE id=p_guardian_id AND teacher_id=v_teacher FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'GUARDIAN_NOT_FOUND' USING ERRCODE='42501';
    END IF;
    UPDATE public.guardians SET
      name=CASE WHEN p_fields ? 'name' THEN v_name ELSE name END,
      family_name=CASE WHEN p_fields ? 'family_name'
        THEN nullif(btrim(p_fields->>'family_name'),'') ELSE family_name END,
      email=CASE WHEN p_fields ? 'email'
        THEN nullif(btrim(p_fields->>'email'),'') ELSE email END,
      phone=CASE WHEN p_fields ? 'phone'
        THEN nullif(btrim(p_fields->>'phone'),'') ELSE phone END,
      secondary_name=CASE WHEN p_fields ? 'secondary_name'
        THEN nullif(btrim(p_fields->>'secondary_name'),'') ELSE secondary_name END,
      secondary_email=CASE WHEN p_fields ? 'secondary_email'
        THEN nullif(btrim(p_fields->>'secondary_email'),'') ELSE secondary_email END,
      secondary_phone=CASE WHEN p_fields ? 'secondary_phone'
        THEN nullif(btrim(p_fields->>'secondary_phone'),'') ELSE secondary_phone END,
      email_recipients=CASE WHEN p_fields ? 'email_recipients'
        THEN p_fields->>'email_recipients' ELSE email_recipients END
    WHERE id=v_guardian.id AND teacher_id=v_teacher
    RETURNING * INTO v_guardian;
  END IF;

  IF p_replace_members THEN
    SELECT array_agg(DISTINCT guardian_id) INTO v_prior_guardians
      FROM public.students WHERE teacher_id=v_teacher
        AND id=ANY(p_student_ids) AND guardian_id IS NOT NULL
        AND guardian_id<>v_guardian.id;
    UPDATE public.students SET guardian_id=NULL
      WHERE teacher_id=v_teacher AND guardian_id=v_guardian.id
        AND NOT (id=ANY(p_student_ids));
    UPDATE public.students SET guardian_id=v_guardian.id
      WHERE teacher_id=v_teacher AND id=ANY(p_student_ids);
    GET DIAGNOSTICS v_assigned = ROW_COUNT;
    -- A student may have disappeared between preflight and the write.
    -- Never acknowledge a partly reassigned roster.
    IF v_assigned<>cardinality(p_student_ids) THEN
      RAISE EXCEPTION 'GUARDIAN_ROSTER_CHANGED' USING ERRCODE='40001';
    END IF;
  END IF;

  FOR v_new IN SELECT value FROM jsonb_array_elements(p_new_students) LOOP
    v_name:=btrim(v_new->>'name');
    IF jsonb_typeof(v_new) IS DISTINCT FROM 'object'
      OR v_name IS NULL OR length(v_name) NOT BETWEEN 1 AND 200
      OR (v_new ? 'birthdate' AND v_new->'birthdate'<>'null'::jsonb
        AND jsonb_typeof(v_new->'birthdate')<>'string') THEN
      RAISE EXCEPTION 'GUARDIAN_INVALID_STUDENT' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.students(teacher_id,guardian_id,name,birthdate)
    VALUES(v_teacher,v_guardian.id,v_name,nullif(v_new->>'birthdate','')::date);
  END LOOP;

  -- Preserve the previous optional cleanup, without allowing any FK conflict
  -- from an unrelated historic record to roll back a successful roster edit.
  IF v_prior_guardians IS NOT NULL THEN
    FOREACH v_old IN ARRAY v_prior_guardians LOOP
      BEGIN
        DELETE FROM public.guardians g
          WHERE g.id=v_old AND g.teacher_id=v_teacher
            AND NOT EXISTS (SELECT 1 FROM public.students s
              WHERE s.teacher_id=v_teacher AND s.guardian_id=g.id)
            AND NOT EXISTS (SELECT 1 FROM public.invoices i
              WHERE i.teacher_id=v_teacher AND i.guardian_id=g.id);
      EXCEPTION WHEN foreign_key_violation THEN
        NULL;
      END;
    END LOOP;
  END IF;
  RETURN to_jsonb(v_guardian);
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_guardian_save(uuid,jsonb,uuid[],boolean,jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_guardian_save(uuid,jsonb,uuid[],boolean,jsonb)
  TO authenticated;

-- Event master record, frozen invitees and RSVP reconciliation are one
-- transaction for both signed-in website and delegated OAuth/MCP callers.
-- No emailed invitations are sent by this function.
CREATE OR REPLACE FUNCTION public.ccp_teacher_event_save(
  p_event_id uuid, p_fields jsonb, p_student_ids uuid[], p_repertoire jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid:=auth.uid();
  v_event public.events%ROWTYPE;
  v_title text;
  v_start timestamptz;
  v_end timestamptz;
  v_ids integer;
  v_roster uuid;
  v_repertoire text;
  v_index integer;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_fields) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_repertoire) IS DISTINCT FROM 'object'
    OR pg_column_size(p_fields)>16384 OR pg_column_size(p_repertoire)>2097152
    OR EXISTS (SELECT 1 FROM jsonb_each(p_fields) AS f
       WHERE f.key NOT IN (
         'title','description','location','starts_at','ends_at','send_reminder'
       )) THEN
    RAISE EXCEPTION 'EVENT_INVALID_INPUT' USING ERRCODE='22023';
  END IF;
  IF p_student_ids IS NOT NULL AND (
     cardinality(p_student_ids)>200
     OR array_position(p_student_ids,NULL) IS NOT NULL
     OR cardinality(p_student_ids)<>(SELECT count(DISTINCT id)
         FROM unnest(p_student_ids) AS id)
  ) THEN
    RAISE EXCEPTION 'EVENT_INVALID_ROSTER' USING ERRCODE='22023';
  END IF;
  -- No elevated UPDATE rights on teachers are required here. Existing
  -- student-capacity triggers serialize inserts on the teacher row, while
  -- family/event rows and PostgreSQL foreign keys protect their own writes.
  PERFORM 1 FROM public.teachers WHERE id=v_teacher;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
  IF p_student_ids IS NOT NULL THEN
    SELECT count(*) INTO v_ids FROM public.students
      WHERE id=ANY(p_student_ids) AND teacher_id=v_teacher
        AND archived_at IS NULL;
    IF v_ids<>cardinality(p_student_ids) THEN
      RAISE EXCEPTION 'EVENT_STUDENT_NOT_FOUND_OR_ARCHIVED'
        USING ERRCODE='42501';
    END IF;
  END IF;

  IF p_event_id IS NULL THEN
    v_title:=btrim(p_fields->>'title');
    IF v_title IS NULL OR length(v_title) NOT BETWEEN 1 AND 200
       OR nullif(p_fields->>'starts_at','') IS NULL THEN
      RAISE EXCEPTION 'EVENT_TITLE_AND_START_REQUIRED' USING ERRCODE='22023';
    END IF;
    v_start:=(p_fields->>'starts_at')::timestamptz;
    v_end:=nullif(p_fields->>'ends_at','')::timestamptz;
    IF v_end IS NOT NULL AND v_end<=v_start THEN
      RAISE EXCEPTION 'EVENT_END_BEFORE_START' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.events(
      teacher_id,title,description,location,starts_at,ends_at,send_reminder
    ) VALUES(
      v_teacher,v_title,coalesce(p_fields->>'description',''),
      coalesce(p_fields->>'location',''),v_start,v_end,
      coalesce((p_fields->>'send_reminder')::boolean,false)
    ) RETURNING * INTO v_event;
    -- An empty roster is valid for a brand-new event.
    p_student_ids:=coalesce(p_student_ids,ARRAY[]::uuid[]);
  ELSE
    SELECT * INTO v_event FROM public.events
      WHERE id=p_event_id AND teacher_id=v_teacher FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE='42501';
    END IF;
    v_title:=CASE WHEN p_fields ? 'title'
      THEN btrim(p_fields->>'title') ELSE v_event.title END;
    IF v_title IS NULL OR length(v_title) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'EVENT_INVALID_TITLE' USING ERRCODE='22023';
    END IF;
    v_start:=CASE WHEN p_fields ? 'starts_at'
      THEN (p_fields->>'starts_at')::timestamptz ELSE v_event.starts_at END;
    v_end:=CASE WHEN p_fields ? 'ends_at'
      THEN nullif(p_fields->>'ends_at','')::timestamptz ELSE v_event.ends_at END;
    IF v_start IS NULL OR (v_end IS NOT NULL AND v_end<=v_start) THEN
      RAISE EXCEPTION 'EVENT_END_BEFORE_START' USING ERRCODE='22023';
    END IF;
    UPDATE public.events SET
      title=v_title,
      description=CASE WHEN p_fields ? 'description'
        THEN coalesce(p_fields->>'description','') ELSE description END,
      location=CASE WHEN p_fields ? 'location'
        THEN coalesce(p_fields->>'location','') ELSE location END,
      starts_at=v_start,
      ends_at=v_end,
      send_reminder=CASE WHEN p_fields ? 'send_reminder'
        THEN (p_fields->>'send_reminder')::boolean ELSE send_reminder END,
      reminder_sent_at=CASE WHEN v_start IS DISTINCT FROM v_event.starts_at
        THEN NULL ELSE reminder_sent_at END,
      updated_at=now()
    WHERE id=v_event.id AND teacher_id=v_teacher RETURNING * INTO v_event;
  END IF;

  IF p_student_ids IS NOT NULL THEN
    -- A roster replacement must reject repertoire assigned to a student
    -- outside that replacement; silently dropping a coach's note is unsafe.
    IF EXISTS (
      SELECT 1 FROM jsonb_each(p_repertoire) AS item
      WHERE item.key <> ALL(p_student_ids::text[])
        OR jsonb_typeof(item.value)<>'string'
        OR length(item.value #>> '{}')>10000
    ) THEN
      RAISE EXCEPTION 'EVENT_INVALID_REPERTOIRE' USING ERRCODE='22023';
    END IF;
    DELETE FROM public.event_students
      WHERE event_id=v_event.id AND NOT (student_id=ANY(p_student_ids));
    FOR v_roster,v_index IN
      SELECT student_id,ordinality::integer
      FROM unnest(p_student_ids) WITH ORDINALITY AS roster(student_id,ordinality)
    LOOP
      v_repertoire:=coalesce(p_repertoire->>v_roster::text,'');
      IF jsonb_typeof(p_repertoire->v_roster::text) NOT IN ('string')
         AND p_repertoire ? v_roster::text THEN
        RAISE EXCEPTION 'EVENT_INVALID_REPERTOIRE' USING ERRCODE='22023';
      END IF;
      IF length(v_repertoire)>10000 THEN
        RAISE EXCEPTION 'EVENT_INVALID_REPERTOIRE' USING ERRCODE='22023';
      END IF;
      INSERT INTO public.event_students(event_id,student_id,repertoire,sort_order)
      VALUES(v_event.id,v_roster,v_repertoire,v_index-1)
      ON CONFLICT(event_id,student_id) DO UPDATE SET
        -- Keep previously recorded student-specific notes when the caller
        -- replaces the roster but does not explicitly replace those notes.
        repertoire=CASE WHEN p_repertoire ? v_roster::text
          THEN EXCLUDED.repertoire ELSE event_students.repertoire END,
        sort_order=EXCLUDED.sort_order;
    END LOOP;

    -- Keep existing responses for families still invited; add new pending
    -- responses and remove only families no longer represented in the roster.
    DELETE FROM public.event_rsvps r WHERE r.event_id=v_event.id
      AND NOT EXISTS (
        SELECT 1 FROM public.event_students es
        JOIN public.students s ON s.id=es.student_id
        WHERE es.event_id=v_event.id AND s.guardian_id=r.guardian_id
      );
    INSERT INTO public.event_rsvps(event_id,guardian_id,status)
      SELECT DISTINCT v_event.id,s.guardian_id,'pending'::public.rsvp_status
      FROM public.event_students es
      JOIN public.students s ON s.id=es.student_id
      WHERE es.event_id=v_event.id AND s.guardian_id IS NOT NULL
      ON CONFLICT(event_id,guardian_id) DO NOTHING;
  ELSE
    -- Editing repertoire alone must not be ignored: the website editor and
    -- MCP both permit patches without replacing the whole student roster.
    -- Validate all keys before writing anything; unknown roster IDs fail
    -- rather than silently losing a coach's correction.
    IF EXISTS (
      SELECT 1 FROM jsonb_each(p_repertoire) AS item
      WHERE jsonb_typeof(item.value)<>'string'
        OR length(item.value #>> '{}')>10000
        OR NOT EXISTS (
          SELECT 1 FROM public.event_students es
          WHERE es.event_id=v_event.id AND es.student_id::text=item.key
        )
    ) THEN
      RAISE EXCEPTION 'EVENT_INVALID_REPERTOIRE' USING ERRCODE='22023';
    END IF;
    UPDATE public.event_students AS es SET repertoire=item.value #>> '{}'
      FROM jsonb_each(p_repertoire) AS item
      WHERE es.event_id=v_event.id AND es.student_id::text=item.key;
  END IF;
  RETURN to_jsonb(v_event);
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_teacher_event_save(uuid,jsonb,uuid[],jsonb)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_teacher_event_save(uuid,jsonb,uuid[],jsonb)
 TO authenticated;

-- Family deletion is safe only while no student or invoice references it.
-- A concurrent student reassignment cannot evade the preflight preview:
-- PostgreSQL's FK KEY SHARE locks serialize against the guardian row DELETE.
-- Privileged service-role tenant erasure remains an explicit separate flow.
CREATE OR REPLACE FUNCTION public.ccp_guardian_delete_restrict()
 RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
 SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user='authenticated' THEN
   IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM OLD.teacher_id THEN
     RAISE EXCEPTION 'GUARDIAN_NOT_FOUND' USING ERRCODE='42501';
   END IF;
   IF EXISTS(SELECT 1 FROM public.students s
     WHERE s.guardian_id=OLD.id)
     OR EXISTS(SELECT 1 FROM public.invoices i
       WHERE i.guardian_id=OLD.id) THEN
     RAISE EXCEPTION 'GUARDIAN_HAS_LINKED_HISTORY' USING ERRCODE='23503';
   END IF;
 END IF;
 RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_guardian_delete_restrict()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS ccp_guardian_delete_restrict ON public.guardians;
CREATE TRIGGER ccp_guardian_delete_restrict
 BEFORE DELETE ON public.guardians
 FOR EACH ROW EXECUTE FUNCTION public.ccp_guardian_delete_restrict();

-- Shared website/MCP family portal rotation with a durable replay key.
-- A delayed network retry must not rotate the already-new link a second time.
-- The secret stays browser-only; MCP adapters discard portal_token.
ALTER TABLE public.guardians
 ADD COLUMN IF NOT EXISTS portal_rotation_request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS ccp_guardians_owner_portal_rotation_request
 ON public.guardians(teacher_id,portal_rotation_request_id)
 WHERE portal_rotation_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ccp_guardian_rotate_portal_token(
  p_guardian_id uuid, p_request_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_teacher uuid:=auth.uid();
  v_guardian public.guardians%ROWTYPE;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_guardian FROM public.guardians
   WHERE id=p_guardian_id AND teacher_id=v_teacher FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NOT NULL
     AND v_guardian.portal_rotation_request_id=p_request_id THEN
    RETURN jsonb_build_object('id',v_guardian.id,
     'portal_token',v_guardian.portal_token,'replayed',true);
  END IF;
  IF p_request_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.guardians
     WHERE teacher_id=v_teacher AND portal_rotation_request_id=p_request_id
       AND id<>p_guardian_id
  ) THEN
    RAISE EXCEPTION 'PORTAL_ROTATION_REQUEST_CONFLICT' USING ERRCODE='23505';
  END IF;
  UPDATE public.guardians SET
    portal_token=encode(extensions.gen_random_bytes(24),'hex'),
    portal_rotation_request_id=p_request_id
    WHERE id=p_guardian_id AND teacher_id=v_teacher
    RETURNING * INTO v_guardian;
  RETURN jsonb_build_object('id',v_guardian.id,
    'portal_token',v_guardian.portal_token,'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_guardian_rotate_portal_token(uuid,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_guardian_rotate_portal_token(uuid,uuid)
 TO authenticated;

-- Durable per-teacher event request receipts for browser ↔ delegated MCP replay.
-- The existing ccp_teacher_event_save transaction owns event/roster/RSVP;
-- this wrapper locks one request key BEFORE calling it and records its
-- result in the SAME PostgreSQL transaction. No external email is sent.
CREATE TABLE IF NOT EXISTS public.ccp_event_request_receipts(
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  mutation_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id,request_id)
);
ALTER TABLE public.ccp_event_request_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ccp_event_receipts_owner ON public.ccp_event_request_receipts;
CREATE POLICY ccp_event_receipts_owner ON public.ccp_event_request_receipts
  FOR ALL TO authenticated
  USING(teacher_id=auth.uid()) WITH CHECK(teacher_id=auth.uid());
REVOKE ALL ON public.ccp_event_request_receipts FROM PUBLIC,anon;
GRANT SELECT,INSERT ON public.ccp_event_request_receipts TO authenticated;

CREATE OR REPLACE FUNCTION public.ccp_teacher_event_save_replay(
  p_event_id uuid,p_fields jsonb,p_student_ids uuid[],
  p_repertoire jsonb,p_request_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid:=auth.uid();
  v_hash text;
  v_previous public.ccp_event_request_receipts%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL THEN
    RETURN public.ccp_teacher_event_save(
      p_event_id,p_fields,p_student_ids,p_repertoire);
  END IF;
  -- jsonb has canonical key ordering. Include all editable inputs and the
  -- target event ID so a key cannot be silently reused for another mutation.
  v_hash:=md5(jsonb_build_object(
    'eventId',p_event_id,'fields',p_fields,'studentIds',p_student_ids,
    'repertoire',p_repertoire)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_teacher::text||':event:'||p_request_id::text,0));
  SELECT * INTO v_previous FROM public.ccp_event_request_receipts
   WHERE teacher_id=v_teacher AND request_id=p_request_id;
  IF FOUND THEN
    IF v_previous.mutation_hash<>v_hash THEN
      RAISE EXCEPTION 'EVENT_REQUEST_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN v_previous.response||jsonb_build_object('replayed',true);
  END IF;
  v_result:=public.ccp_teacher_event_save(
    p_event_id,p_fields,p_student_ids,p_repertoire);
  INSERT INTO public.ccp_event_request_receipts(
    teacher_id,request_id,mutation_hash,response
  ) VALUES(v_teacher,p_request_id,v_hash,v_result);
  RETURN v_result||jsonb_build_object('replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_teacher_event_save_replay(
 uuid,jsonb,uuid[],jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_teacher_event_save_replay(
 uuid,jsonb,uuid[],jsonb,uuid) TO authenticated;

-- Per-teacher durable family + student-roster request receipts.
-- Prevents duplicate children/families when the teacher's browser and agent
-- retry the same confirmed mutation after a timeout. Sensitive portal links
-- are never copied into receipt rows; they remain on the guardian record.
CREATE TABLE IF NOT EXISTS public.ccp_guardian_request_receipts(
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  mutation_hash text NOT NULL,
  guardian_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(teacher_id,request_id)
);
ALTER TABLE public.ccp_guardian_request_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ccp_guardian_receipts_owner ON public.ccp_guardian_request_receipts;
CREATE POLICY ccp_guardian_receipts_owner ON public.ccp_guardian_request_receipts
  FOR ALL TO authenticated
  USING (teacher_id=auth.uid()) WITH CHECK(teacher_id=auth.uid());
REVOKE ALL ON public.ccp_guardian_request_receipts FROM PUBLIC,anon;
GRANT SELECT,INSERT ON public.ccp_guardian_request_receipts TO authenticated;

CREATE OR REPLACE FUNCTION public.ccp_guardian_save_replay(
  p_guardian_id uuid,p_fields jsonb,p_student_ids uuid[],
  p_replace_members boolean,p_new_students jsonb,p_request_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid:=auth.uid();
  v_hash text;
  v_previous public.ccp_guardian_request_receipts%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL THEN
    RETURN public.ccp_guardian_save(
      p_guardian_id,p_fields,p_student_ids,p_replace_members,p_new_students);
  END IF;
  v_hash:=md5(jsonb_build_object(
    'guardianId',p_guardian_id,'fields',p_fields,
    'studentIds',p_student_ids,'replaceMembers',p_replace_members,
    'newStudents',p_new_students)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_teacher::text||':guardian:'||p_request_id::text,0));
  SELECT * INTO v_previous FROM public.ccp_guardian_request_receipts
    WHERE teacher_id=v_teacher AND request_id=p_request_id;
  IF FOUND THEN
    IF v_previous.mutation_hash<>v_hash THEN
      RAISE EXCEPTION 'GUARDIAN_REQUEST_CONFLICT' USING ERRCODE='23505';
    END IF;
    SELECT to_jsonb(g) INTO v_result FROM public.guardians g
      WHERE g.teacher_id=v_teacher AND g.id=v_previous.guardian_id;
    IF v_result IS NULL THEN
      RAISE EXCEPTION 'GUARDIAN_ALREADY_DELETED' USING ERRCODE='23514';
    END IF;
    RETURN v_result||jsonb_build_object('replayed',true);
  END IF;
  v_result:=public.ccp_guardian_save(
    p_guardian_id,p_fields,p_student_ids,p_replace_members,p_new_students);
  INSERT INTO public.ccp_guardian_request_receipts(
    teacher_id,request_id,mutation_hash,guardian_id
  ) VALUES(v_teacher,p_request_id,v_hash,(v_result->>'id')::uuid);
  RETURN v_result||jsonb_build_object('replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_guardian_save_replay(
 uuid,jsonb,uuid[],boolean,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_guardian_save_replay(
 uuid,jsonb,uuid[],boolean,jsonb,uuid) TO authenticated;

-- Browser and MCP manual-payment writes must never leave payment rows
-- without their paid invoice status, or overpay after a concurrent retry.
-- External Stripe links are retired in the service first; SQL verifies their
-- exact expected ID and clears it in the same financial transaction.
CREATE OR REPLACE FUNCTION public.ccp_manual_payment_commit(
  p_invoice_id uuid,p_amount_cents integer,p_note text,
  p_request_id uuid,p_expected_checkout_session text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid:=auth.uid();
  v_invoice public.invoices%ROWTYPE;
  v_existing public.payments%ROWTYPE;
  v_payment_id uuid;
  v_paid bigint;
  v_balance bigint;
  v_amount integer;
  v_settled boolean;
  v_external text;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF p_note IS NULL OR length(p_note)>500 OR
    (p_amount_cents IS NOT NULL AND p_amount_cents<=0) OR
    (p_expected_checkout_session IS NOT NULL
       AND length(p_expected_checkout_session)>512) THEN
    RAISE EXCEPTION 'INVALID_MANUAL_PAYMENT' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_invoice FROM public.invoices
    WHERE id=p_invoice_id AND teacher_id=v_teacher FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
  v_external:=CASE WHEN p_request_id IS NOT NULL
    THEN 'mcp:'||p_request_id::text ELSE NULL END;
  IF v_external IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.payments
      WHERE invoice_id=p_invoice_id AND external_id=v_external;
    IF FOUND THEN
      IF v_existing.method<>'manual' OR v_existing.note<>p_note OR
        (p_amount_cents IS NOT NULL
         AND v_existing.amount_cents<>p_amount_cents) THEN
        RAISE EXCEPTION 'MANUAL_PAYMENT_REQUEST_CONFLICT' USING ERRCODE='23505';
      END IF;
      RETURN jsonb_build_object('ok',true,'replayed',true,
        'paymentId',v_existing.id,'amountCents',v_existing.amount_cents);
    END IF;
  END IF;
  IF v_invoice.status='void' THEN
    RAISE EXCEPTION 'INVOICE_VOID' USING ERRCODE='23514';
  END IF;
  SELECT COALESCE(SUM(amount_cents),0) INTO v_paid
    FROM public.payments WHERE invoice_id=p_invoice_id;
  v_balance:=v_invoice.subtotal_cents-v_paid;
  IF v_invoice.status='paid' AND v_balance<=0 THEN
    RETURN jsonb_build_object('ok',true,'alreadyPaid',true);
  END IF;
  IF v_balance<=0 THEN
    RAISE EXCEPTION 'INVOICE_NOTHING_OWED' USING ERRCODE='22023';
  END IF;
  IF v_invoice.status='draft' AND p_amount_cents IS NOT NULL THEN
    RAISE EXCEPTION 'PARTIAL_DRAFT_PAYMENT' USING ERRCODE='23514';
  END IF;
  IF v_invoice.stripe_payment_intent_id IS NOT NULL THEN
    RAISE EXCEPTION 'STRIPE_PAYMENT_RECONCILIATION_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF v_invoice.stripe_checkout_session_id IS NOT NULL
      OR v_invoice.stripe_checkout_url IS NOT NULL THEN
    IF v_invoice.stripe_checkout_session_id IS NULL OR
      p_expected_checkout_session IS DISTINCT FROM
      v_invoice.stripe_checkout_session_id THEN
      RAISE EXCEPTION 'CHECKOUT_RECONCILIATION_REQUIRED' USING ERRCODE='23514';
    END IF;
  ELSIF p_expected_checkout_session IS NOT NULL THEN
    RAISE EXCEPTION 'CHECKOUT_RECONCILIATION_REQUIRED' USING ERRCODE='23514';
  END IF;
  v_amount:=coalesce(p_amount_cents,v_balance::integer);
  IF v_amount>v_balance OR v_amount<=0 THEN
    RAISE EXCEPTION 'INVALID_MANUAL_PAYMENT_AMOUNT' USING ERRCODE='22023';
  END IF;
  IF p_expected_checkout_session IS NOT NULL THEN
    UPDATE public.invoices
      SET stripe_checkout_session_id=NULL,stripe_checkout_url=NULL
      WHERE id=p_invoice_id AND teacher_id=v_teacher;
  END IF;
  INSERT INTO public.payments(invoice_id,amount_cents,method,note,external_id)
    VALUES(p_invoice_id,v_amount,'manual',p_note,v_external)
    RETURNING id INTO v_payment_id;
  v_balance:=v_balance-v_amount;
  v_settled:=v_balance<=0;
  IF v_settled THEN
    UPDATE public.invoices SET status='paid',paid_at=now(),
       payment_method='manual'
      WHERE id=p_invoice_id AND teacher_id=v_teacher;
  END IF;
  RETURN jsonb_build_object('ok',true,'paid',v_settled,
    'balanceCents',v_balance,'paymentId',v_payment_id,
    'amountCents',v_amount);
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_manual_payment_commit(
 uuid,integer,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_manual_payment_commit(
 uuid,integer,text,uuid,text) TO authenticated;

-- Atomic full-feature student creation, including optional family of one.
-- Both browser and delegated MCP use this authenticated transaction instead of
-- separate guardian+student POSTs that could leave orphaned portal families.
-- Student-capacity triggers serialize and enforce hosted quotas inside INSERT.
CREATE TABLE IF NOT EXISTS public.ccp_student_create_receipts(
 teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 mutation_hash text NOT NULL,
 student_id uuid NOT NULL,
 created_family boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(teacher_id,request_id)
);
ALTER TABLE public.ccp_student_create_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ccp_student_create_receipts_owner ON public.ccp_student_create_receipts;
CREATE POLICY ccp_student_create_receipts_owner ON public.ccp_student_create_receipts
 FOR ALL TO authenticated
 USING(teacher_id=auth.uid()) WITH CHECK(teacher_id=auth.uid());
REVOKE ALL ON public.ccp_student_create_receipts FROM PUBLIC,anon;
GRANT SELECT,INSERT ON public.ccp_student_create_receipts TO authenticated;

CREATE OR REPLACE FUNCTION public.ccp_student_create_full(
 p_name text,p_birthdate date,p_level text,p_teacher_notes text,
 p_guardian_id uuid,p_contact_email text,p_contact_phone text,
 p_contact_name text,p_adult_self boolean,p_request_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp AS $$
DECLARE
 v_teacher uuid:=auth.uid();
 v_student public.students%ROWTYPE;
 v_guardian_id uuid:=p_guardian_id;
 v_created_family boolean:=false;
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
    OR length(coalesce(v_contact,''))>200 THEN
   RAISE EXCEPTION 'STUDENT_INVALID_INPUT' USING ERRCODE='22023';
 END IF;
 IF p_request_id IS NOT NULL THEN
   v_hash:=md5(jsonb_build_object(
     'name',v_name,'birthdate',p_birthdate,'level',p_level,
     'notes',p_teacher_notes,'guardianId',p_guardian_id,
     'email',v_email,'phone',v_phone,'contactName',v_contact,
     'adultSelf',coalesce(p_adult_self,false))::text);
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
       'createdFamily',v_previous.created_family,'replayed',true);
   END IF;
 END IF;
 IF v_guardian_id IS NOT NULL THEN
   PERFORM 1 FROM public.guardians
     WHERE id=v_guardian_id AND teacher_id=v_teacher;
   IF NOT FOUND THEN
     RAISE EXCEPTION 'GUARDIAN_NOT_FOUND' USING ERRCODE='42501';
   END IF;
 ELSE
   IF v_email IS NOT NULL OR v_phone IS NOT NULL
      OR coalesce(p_adult_self,false) THEN
     IF NOT coalesce(p_adult_self,false) AND v_contact IS NULL THEN
       RAISE EXCEPTION 'GUARDIAN_NAME_REQUIRED' USING ERRCODE='22023';
     END IF;
     INSERT INTO public.guardians(
       teacher_id,name,family_name,email,phone,email_recipients,portal_token
     ) VALUES (
       v_teacher,coalesce(v_contact,v_name),
       CASE WHEN coalesce(p_adult_self,false) THEN v_name ELSE NULL END,
       v_email,v_phone,'primary',
       encode(extensions.gen_random_bytes(24),'hex')
     ) RETURNING id INTO v_guardian_id;
     v_created_family:=true;
   ELSIF v_contact IS NOT NULL THEN
     RAISE EXCEPTION 'GUARDIAN_CONTACT_CHANNEL_REQUIRED' USING ERRCODE='22023';
   END IF;
 END IF;
 INSERT INTO public.students(
   teacher_id,name,guardian_id,birthdate,level,teacher_notes
 ) VALUES(
   v_teacher,v_name,v_guardian_id,p_birthdate,
   nullif(btrim(p_level),''),coalesce(btrim(p_teacher_notes),'')
 ) RETURNING * INTO v_student;
 IF p_request_id IS NOT NULL THEN
   INSERT INTO public.ccp_student_create_receipts(
     teacher_id,request_id,mutation_hash,student_id,created_family
   ) VALUES(
     v_teacher,p_request_id,v_hash,v_student.id,v_created_family
   );
 END IF;
 RETURN jsonb_build_object('student',to_jsonb(v_student),
   'createdFamily',v_created_family,'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_student_create_full(
 text,date,text,text,uuid,text,text,text,boolean,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_student_create_full(
 text,date,text,text,uuid,text,text,text,boolean,uuid) TO authenticated;

-- Correcting an accidental cash payment must atomically reopen a previously
-- settled invoice, with the same owner checks and Stripe refund protection
-- regardless of whether the call came from website or delegated MCP.
-- The existing AFTER DELETE payment trigger recalculates invoice status.
CREATE OR REPLACE FUNCTION public.ccp_manual_payment_remove(
  p_invoice_id uuid,p_payment_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid:=auth.uid();
  v_invoice public.invoices%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_status text;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_invoice FROM public.invoices
    WHERE id=p_invoice_id AND teacher_id=v_teacher FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
  IF v_invoice.status='void' THEN
    RAISE EXCEPTION 'INVOICE_VOID' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_payment FROM public.payments
    WHERE id=p_payment_id AND invoice_id=p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE='42501';
  END IF;
  IF v_payment.method<>'manual' THEN
    RAISE EXCEPTION 'STRIPE_REFUND_REQUIRED' USING ERRCODE='23514';
  END IF;
  DELETE FROM public.payments
    WHERE id=p_payment_id AND invoice_id=p_invoice_id;
  SELECT status INTO v_status FROM public.invoices
    WHERE id=p_invoice_id AND teacher_id=v_teacher;
  RETURN jsonb_build_object('ok',true,'status',v_status);
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_manual_payment_remove(uuid,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_manual_payment_remove(uuid,uuid)
 TO authenticated;

-- Typed chess material corrections: shared website/MCP idempotent, owner-scoped,
-- revision-guarded root+subtype edits. Fresh installs only; never reset real data.
ALTER TABLE public.learning_materials
  ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0);

CREATE TABLE public.learning_material_edit_receipts (
  teacher_id uuid NOT NULL,
  request_id uuid NOT NULL,
  material_id uuid NOT NULL,
  request_hash text NOT NULL,
  resulting_revision bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id,request_id),
  FOREIGN KEY (teacher_id,material_id)
    REFERENCES public.learning_materials(teacher_id,id) ON DELETE RESTRICT
);
ALTER TABLE public.learning_material_edit_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY learning_material_edits_owner ON public.learning_material_edit_receipts
  FOR SELECT TO authenticated USING (teacher_id=auth.uid());
GRANT SELECT ON public.learning_material_edit_receipts TO authenticated;

CREATE FUNCTION public.ccp_material_catalog_update(
 p_material_id uuid,p_expected_revision bigint,p_kind text,
 p_title text,p_description text,p_source_url text,p_details jsonb,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=public,pg_temp AS $update_material$
DECLARE
 v_teacher uuid := auth.uid();
 v_root public.learning_materials%ROWTYPE;
 v_hash text;
 v_receipt public.learning_material_edit_receipts%ROWTYPE;
 v_rows integer;
BEGIN
 IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 IF p_material_id IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL OR
    p_expected_revision < 1 OR p_kind NOT IN ('game','puzzle','drill','study_chapter','external_link') OR
    char_length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 160 OR
    char_length(coalesce(p_description,'')) > 4000 OR
    (p_source_url IS NOT NULL AND
     (p_source_url !~ '^https://[^[:space:]]+$' OR char_length(p_source_url)>2048)) OR
    p_details IS NULL OR jsonb_typeof(p_details)<>'object' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR';
 END IF;
 v_hash:=md5(jsonb_build_array(p_material_id,p_expected_revision,p_kind,
    btrim(p_title),coalesce(p_description,''),p_source_url,p_details)::text);

 SELECT * INTO v_receipt FROM public.learning_material_edit_receipts
   WHERE teacher_id=v_teacher AND request_id=p_request_id;
 IF FOUND THEN
   IF v_receipt.material_id<>p_material_id OR v_receipt.request_hash<>v_hash
     THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('id',v_receipt.material_id,
     'revision',v_receipt.resulting_revision,'replayed',true);
 END IF;

 SELECT * INTO v_root FROM public.learning_materials
   WHERE teacher_id=v_teacher AND id=p_material_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 -- Another caller may have committed the identical request while we waited
 -- for the row lock; re-read its receipt BEFORE comparing stale revisions.
 SELECT * INTO v_receipt FROM public.learning_material_edit_receipts
   WHERE teacher_id=v_teacher AND request_id=p_request_id;
 IF FOUND THEN
   IF v_receipt.material_id<>p_material_id OR v_receipt.request_hash<>v_hash
     THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('id',v_receipt.material_id,
     'revision',v_receipt.resulting_revision,'replayed',true);
 END IF;
 IF v_root.kind<>p_kind THEN RAISE EXCEPTION 'KIND_MISMATCH'; END IF;
 IF v_root.revision<>p_expected_revision THEN RAISE EXCEPTION 'STALE_REVISION'; END IF;

 IF p_kind IN ('study_chapter','external_link') AND p_source_url IS NULL
 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 IF p_kind='external_link' AND p_details <> '{}'::jsonb
 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;

 IF p_kind='game' THEN
   IF char_length(btrim(coalesce(p_details->>'pgn',''))) NOT BETWEEN 1 AND 150000 OR
      char_length(coalesce(p_details->>'whitePlayer',''))>120 OR
      char_length(coalesce(p_details->>'blackPlayer',''))>120 OR
      coalesce(p_details->>'result','*') NOT IN ('1-0','0-1','1/2-1/2','*')
     THEN RAISE EXCEPTION 'INVALID_GAME'; END IF;
   UPDATE public.chess_games SET pgn=p_details->>'pgn',
     white_player=coalesce(p_details->>'whitePlayer',''),
     black_player=coalesce(p_details->>'blackPlayer',''),
     result=coalesce(p_details->>'result','*')
     WHERE teacher_id=v_teacher AND material_id=p_material_id;
 ELSIF p_kind='puzzle' THEN
   IF char_length(btrim(coalesce(p_details->>'fen',''))) NOT BETWEEN 15 AND 150 OR
      jsonb_typeof(coalesce(p_details->'themes','[]'::jsonb))<>'array'
     THEN RAISE EXCEPTION 'INVALID_PUZZLE'; END IF;
   UPDATE public.chess_puzzles SET fen=p_details->>'fen',
     solution=p_details->>'solution',
     themes=ARRAY(SELECT jsonb_array_elements_text(
       coalesce(p_details->'themes','[]'::jsonb)))
     WHERE teacher_id=v_teacher AND material_id=p_material_id;
 ELSIF p_kind='drill' THEN
   IF char_length(btrim(coalesce(p_details->>'instructions',''))) NOT BETWEEN 1 AND 5000
     THEN RAISE EXCEPTION 'INVALID_DRILL'; END IF;
   UPDATE public.chess_drills SET
     instructions=p_details->>'instructions',
     mode=coalesce(p_details->>'mode','other'),
     repetitions=(p_details->>'repetitions')::integer
     WHERE teacher_id=v_teacher AND material_id=p_material_id;
 ELSIF p_kind='study_chapter' THEN
   IF char_length(btrim(coalesce(p_details->>'studyId',''))) NOT BETWEEN 1 AND 128
     THEN RAISE EXCEPTION 'INVALID_CHAPTER'; END IF;
   UPDATE public.chess_study_chapters SET
     provider=coalesce(p_details->>'provider','lichess'),
     study_id=p_details->>'studyId',chapter_id=nullif(p_details->>'chapterId','')
     WHERE teacher_id=v_teacher AND material_id=p_material_id;
 ELSE
   -- An external link stores its metadata in the root, not a subtype row.
   v_rows:=1;
 END IF;

 IF p_kind<>'external_link' THEN
   GET DIAGNOSTICS v_rows=ROW_COUNT;
   IF v_rows<>1 THEN RAISE EXCEPTION 'MISSING_SUBTYPE'; END IF;
 END IF;

 UPDATE public.learning_materials SET title=btrim(p_title),
   description=coalesce(p_description,''),source_url=p_source_url,
   revision=revision+1,updated_at=clock_timestamp()
   WHERE teacher_id=v_teacher AND id=p_material_id;

 INSERT INTO public.learning_material_edit_receipts
   (teacher_id,request_id,material_id,request_hash,resulting_revision)
 VALUES(v_teacher,p_request_id,p_material_id,v_hash,v_root.revision+1);
 RETURN jsonb_build_object('id',p_material_id,
   'revision',v_root.revision+1,'replayed',false);
END;
$update_material$;

REVOKE ALL ON FUNCTION public.ccp_material_catalog_update(
  uuid,bigint,text,text,text,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_material_catalog_update(
  uuid,bigint,text,text,text,text,jsonb,uuid) TO authenticated;

-- Atomic, revision-checked typed chess material relationships.
-- Existing material root and typed detail rows remain intact on failed links.
CREATE TABLE public.learning_material_relation_receipts(
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  from_material_id uuid NOT NULL,
  to_material_id uuid NOT NULL,
  relation_type text NOT NULL,
  action text NOT NULL CHECK(action IN ('link','unlink')),
  request_hash text NOT NULL,
  resulting_revision bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(teacher_id,request_id)
);
ALTER TABLE public.learning_material_relation_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_material_relation_receipts
 ON public.learning_material_relation_receipts FOR SELECT TO authenticated
 USING (teacher_id=auth.uid());
GRANT SELECT ON public.learning_material_relation_receipts TO authenticated;

CREATE FUNCTION public.ccp_material_relation_change(
  p_from_material_id uuid,p_to_material_id uuid,p_relation_type text,
  p_action text,p_expected_revision bigint,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
 AS $relation$
DECLARE
 v_teacher uuid:=auth.uid();
 v_locked integer;
 v_source public.learning_materials%ROWTYPE;
 v_target public.learning_materials%ROWTYPE;
 v_receipt public.learning_material_relation_receipts%ROWTYPE;
 v_hash text;
 v_count integer;
BEGIN
 IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 IF p_from_material_id IS NULL OR p_to_material_id IS NULL OR
    p_from_material_id=p_to_material_id OR
    p_relation_type NOT IN ('extracted_from','derived_from','prerequisite') OR
    p_action NOT IN ('link','unlink') OR
    p_expected_revision IS NULL OR p_expected_revision<1 OR
    p_request_id IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 v_hash:=md5(jsonb_build_array(p_from_material_id,p_to_material_id,
   p_relation_type,p_action,p_expected_revision)::text);

 SELECT * INTO v_receipt FROM public.learning_material_relation_receipts
   WHERE teacher_id=v_teacher AND request_id=p_request_id;
 IF FOUND THEN
   IF v_receipt.request_hash<>v_hash
     THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('fromMaterialId',v_receipt.from_material_id,
     'toMaterialId',v_receipt.to_material_id,'relationType',v_receipt.relation_type,
     'action',v_receipt.action,'revision',v_receipt.resulting_revision,'replayed',true);
 END IF;
 -- Stable lock order prevents opposite-direction writers from deadlocking.
 PERFORM 1 FROM public.learning_materials WHERE teacher_id=v_teacher
   AND id IN (p_from_material_id,p_to_material_id) ORDER BY id FOR UPDATE;
 GET DIAGNOSTICS v_locked=ROW_COUNT;
 IF v_locked<>2 THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 -- Recheck after ordered locks: identical concurrent requests replay rather
 -- than incorrectly reporting STALE_REVISION to the slower client.
 SELECT * INTO v_receipt FROM public.learning_material_relation_receipts
   WHERE teacher_id=v_teacher AND request_id=p_request_id;
 IF FOUND THEN
   IF v_receipt.request_hash<>v_hash
     THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('fromMaterialId',v_receipt.from_material_id,
     'toMaterialId',v_receipt.to_material_id,'relationType',v_receipt.relation_type,
     'action',v_receipt.action,'revision',v_receipt.resulting_revision,'replayed',true);
 END IF;
 SELECT * INTO v_source FROM public.learning_materials
   WHERE teacher_id=v_teacher AND id=p_from_material_id;
 SELECT * INTO v_target FROM public.learning_materials
   WHERE teacher_id=v_teacher AND id=p_to_material_id;
 IF v_source.revision<>p_expected_revision THEN RAISE EXCEPTION 'STALE_REVISION'; END IF;
 IF p_relation_type='extracted_from' AND
    (v_source.kind<>'puzzle' OR v_target.kind<>'game')
   THEN RAISE EXCEPTION 'INVALID_RELATION_TYPES'; END IF;

 IF p_action='link' THEN
   INSERT INTO public.learning_material_relations
     (teacher_id,from_material_id,to_material_id,relation_type)
   VALUES(v_teacher,p_from_material_id,p_to_material_id,p_relation_type)
   ON CONFLICT DO NOTHING;
   GET DIAGNOSTICS v_count=ROW_COUNT;
   IF v_count<>1 THEN RAISE EXCEPTION 'RELATION_ALREADY_EXISTS'; END IF;
 ELSE
   DELETE FROM public.learning_material_relations
    WHERE teacher_id=v_teacher AND from_material_id=p_from_material_id
      AND to_material_id=p_to_material_id AND relation_type=p_relation_type;
   GET DIAGNOSTICS v_count=ROW_COUNT;
   IF v_count<>1 THEN RAISE EXCEPTION 'RELATION_NOT_FOUND'; END IF;
 END IF;

 UPDATE public.learning_materials SET
   revision=revision+1,updated_at=clock_timestamp()
   WHERE teacher_id=v_teacher AND id=p_from_material_id;
 INSERT INTO public.learning_material_relation_receipts
   (teacher_id,request_id,from_material_id,to_material_id,relation_type,
    action,request_hash,resulting_revision)
 VALUES(v_teacher,p_request_id,p_from_material_id,p_to_material_id,
   p_relation_type,p_action,v_hash,v_source.revision+1);
 RETURN jsonb_build_object('fromMaterialId',p_from_material_id,
   'toMaterialId',p_to_material_id,'relationType',p_relation_type,
   'action',p_action,'revision',v_source.revision+1,'replayed',false);
END;
$relation$;
REVOKE ALL ON FUNCTION public.ccp_material_relation_change(
 uuid,uuid,text,text,bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_material_relation_change(
 uuid,uuid,text,text,bigint,uuid) TO authenticated;

-- Safe, history-preserving material library archive/restore.
-- Never delete a material and cascade away an existing assignment or source link.
ALTER TABLE public.learning_materials
 ADD COLUMN archived_at timestamptz;
CREATE INDEX learning_materials_active_idx ON public.learning_materials(teacher_id,archived_at,created_at DESC);

CREATE TABLE public.learning_material_lifecycle_receipts(
 teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 material_id uuid NOT NULL,
 request_hash text NOT NULL,
 action text NOT NULL CHECK(action IN ('archive','restore')),
 resulting_revision bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(teacher_id,request_id)
);
ALTER TABLE public.learning_material_lifecycle_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_material_lifecycle_receipts ON public.learning_material_lifecycle_receipts
 FOR SELECT TO authenticated USING(teacher_id=auth.uid());
GRANT SELECT ON public.learning_material_lifecycle_receipts TO authenticated;

CREATE FUNCTION public.ccp_material_lifecycle_change(
 p_material_id uuid,p_expected_revision bigint,p_action text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path='' AS $lifecycle$
DECLARE
 v_teacher uuid:=auth.uid();
 v_root public.learning_materials%ROWTYPE;
 v_old public.learning_material_lifecycle_receipts%ROWTYPE;
 v_hash text;
 v_assignments integer;
 v_relations integer;
 v_evidence integer;
 v_links integer;
BEGIN
 IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 IF p_material_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
    OR p_action NOT IN ('archive','restore') OR p_request_id IS NULL
 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 v_hash:=md5(jsonb_build_array(p_material_id,p_expected_revision,p_action)::text);
 SELECT * INTO v_old FROM public.learning_material_lifecycle_receipts
  WHERE teacher_id=v_teacher AND request_id=p_request_id;
 IF FOUND THEN
   IF v_old.request_hash<>v_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('materialId',v_old.material_id,'action',v_old.action,
    'revision',v_old.resulting_revision,'replayed',true);
 END IF;
 SELECT * INTO v_root FROM public.learning_materials
   WHERE teacher_id=v_teacher AND id=p_material_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 -- Under concurrent website+MCP replay the first commit may become visible
 -- only after this caller obtains the material row lock.
 SELECT * INTO v_old FROM public.learning_material_lifecycle_receipts
   WHERE teacher_id=v_teacher AND request_id=p_request_id;
 IF FOUND THEN
   IF v_old.request_hash<>v_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('materialId',v_old.material_id,'action',v_old.action,
     'revision',v_old.resulting_revision,'replayed',true);
 END IF;
 IF v_root.revision<>p_expected_revision THEN RAISE EXCEPTION 'STALE_REVISION'; END IF;
 IF p_action='archive' THEN
   IF v_root.archived_at IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_ARCHIVED'; END IF;
   SELECT count(*) INTO v_assignments FROM public.training_assignments
     WHERE teacher_id=v_teacher AND material_id=p_material_id;
   SELECT count(*) INTO v_relations FROM public.learning_material_relations
     WHERE teacher_id=v_teacher AND
      (from_material_id=p_material_id OR to_material_id=p_material_id);
   SELECT count(*) INTO v_evidence FROM public.material_teaching_evidence
     WHERE teacher_id=v_teacher AND material_id=p_material_id;
   SELECT count(*) INTO v_links FROM public.material_links
     WHERE teacher_id=v_teacher AND material_id=p_material_id;
   IF v_assignments>0 OR v_relations>0 OR v_evidence>0 OR v_links>0
     THEN RAISE EXCEPTION 'HISTORY_DEPENDENCIES'; END IF;
   UPDATE public.learning_materials SET archived_at=clock_timestamp(),
     updated_at=clock_timestamp(),revision=revision+1
     WHERE teacher_id=v_teacher AND id=p_material_id;
 ELSE
   IF v_root.archived_at IS NULL THEN RAISE EXCEPTION 'NOT_ARCHIVED'; END IF;
   UPDATE public.learning_materials SET archived_at=NULL,
     updated_at=clock_timestamp(),revision=revision+1
     WHERE teacher_id=v_teacher AND id=p_material_id;
 END IF;
 INSERT INTO public.learning_material_lifecycle_receipts
   (teacher_id,request_id,material_id,request_hash,action,resulting_revision)
 VALUES(v_teacher,p_request_id,p_material_id,v_hash,p_action,v_root.revision+1);
 RETURN jsonb_build_object('materialId',p_material_id,'action',p_action,
   'revision',v_root.revision+1,'replayed',false);
END;
$lifecycle$;
REVOKE ALL ON FUNCTION public.ccp_material_lifecycle_change(uuid,bigint,text,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_material_lifecycle_change(uuid,bigint,text,uuid)
 TO authenticated;

-- Canonical teacher-authored training plans and explicit student goal outcomes.
-- No AI/assignment automation may mark a chess goal achieved; coach evidence is
-- required. Append-only revisions retain historical edits and manual overrides.
CREATE TABLE public.student_training_plans(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 student_id uuid NOT NULL,
 title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 1 AND 160),
 summary text NOT NULL DEFAULT '' CHECK(char_length(summary)<=2500),
 status text NOT NULL CHECK(status IN ('draft','active','paused','completed','archived')),
 goals jsonb NOT NULL DEFAULT '[]'::jsonb
   CHECK(jsonb_typeof(goals)='array' AND jsonb_array_length(goals)<=20),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(teacher_id,id),
 FOREIGN KEY(student_id,teacher_id) REFERENCES public.students(id,teacher_id)
   ON DELETE RESTRICT
);
CREATE INDEX student_training_plans_list
 ON public.student_training_plans(teacher_id,student_id,updated_at DESC,id);
ALTER TABLE public.student_training_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_training_plans ON public.student_training_plans
 FOR SELECT TO authenticated USING(teacher_id=auth.uid());
GRANT SELECT ON public.student_training_plans TO authenticated;

CREATE TABLE public.student_training_plan_revisions(
 teacher_id uuid NOT NULL,
 plan_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision>=1),
 snapshot jsonb NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(teacher_id,plan_id,revision),
 FOREIGN KEY(teacher_id,plan_id)
  REFERENCES public.student_training_plans(teacher_id,id) ON DELETE RESTRICT
);
ALTER TABLE public.student_training_plan_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_training_plan_revisions ON public.student_training_plan_revisions
 FOR SELECT TO authenticated USING(teacher_id=auth.uid());
GRANT SELECT ON public.student_training_plan_revisions TO authenticated;

CREATE TABLE public.student_training_plan_receipts(
 teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 request_hash text NOT NULL,
 plan_id uuid NOT NULL,
 revision bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(teacher_id,request_id),
 FOREIGN KEY(teacher_id,plan_id)
  REFERENCES public.student_training_plans(teacher_id,id) ON DELETE RESTRICT
);
ALTER TABLE public.student_training_plan_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_training_plan_receipts ON public.student_training_plan_receipts
 FOR SELECT TO authenticated USING(teacher_id=auth.uid());
GRANT SELECT ON public.student_training_plan_receipts TO authenticated;

CREATE FUNCTION public.ccp_student_training_plan_commit(
 p_plan_id uuid,p_expected_revision bigint,p_student_id uuid,p_title text,
 p_summary text,p_status text,p_goals jsonb,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $commit$
DECLARE
 v_teacher uuid:=auth.uid();
 v_student_archived timestamptz;
 v_existing public.student_training_plans%ROWTYPE;
 v_receipt public.student_training_plan_receipts%ROWTYPE;
 v_goal jsonb;
 v_key text;
 v_hash text;
 v_id uuid;
 v_revision bigint;
BEGIN
 IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 IF p_request_id IS NULL OR p_student_id IS NULL OR
    (p_plan_id IS NULL AND p_expected_revision IS NOT NULL) OR
    (p_plan_id IS NOT NULL AND (p_expected_revision IS NULL OR p_expected_revision<1)) OR
    char_length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 160 OR
    char_length(coalesce(p_summary,''))>2500 OR
    p_status IS NULL OR p_status NOT IN ('draft','active','paused','completed','archived') OR
    p_goals IS NULL OR jsonb_typeof(p_goals)<>'array'
    THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 IF jsonb_array_length(p_goals)>20 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 -- Defend SQL RPC callers that bypass the shared website/MCP Zod boundary.
 FOR v_goal IN SELECT value FROM jsonb_array_elements(p_goals) LOOP
   IF jsonb_typeof(v_goal)<>'object' OR
      coalesce(v_goal->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR
      char_length(btrim(coalesce(v_goal->>'title',''))) NOT BETWEEN 1 AND 160 OR
      coalesce(v_goal->>'status','') NOT IN ('planned','in_progress','achieved','abandoned') OR
      char_length(coalesce(v_goal->>'coachEvidence',''))>1500 OR
      (v_goal->>'targetDate' IS NOT NULL AND
       v_goal->>'targetDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') OR
      (v_goal->>'status'='achieved' AND
       char_length(btrim(coalesce(v_goal->>'coachEvidence','')))<10)
      THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   FOR v_key IN SELECT jsonb_object_keys(v_goal) LOOP
     IF v_key NOT IN ('id','title','status','targetDate','coachEvidence')
        THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   END LOOP;
 END LOOP;
 IF (SELECT count(DISTINCT (v.value->>'id'))
       FROM jsonb_array_elements(p_goals) v)<>jsonb_array_length(p_goals)
   THEN RAISE EXCEPTION 'DUPLICATE_GOAL'; END IF;
 IF p_status='completed' AND EXISTS(
   SELECT 1 FROM jsonb_array_elements(p_goals) v
   WHERE v.value->>'status' IN ('planned','in_progress'))
   THEN RAISE EXCEPTION 'INCOMPLETE_GOALS'; END IF;

 v_hash:=md5(jsonb_build_array(p_plan_id,p_expected_revision,
   p_student_id,btrim(p_title),coalesce(p_summary,''),p_status,p_goals)::text);
 -- Serialize receipt decisions for one teacher, including two competing
 -- requests accidentally reusing the same UUID for different students.
 PERFORM 1 FROM public.teachers WHERE id=v_teacher FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

 SELECT * INTO v_receipt FROM public.student_training_plan_receipts
  WHERE teacher_id=v_teacher AND request_id=p_request_id;
 IF FOUND THEN
   IF v_receipt.request_hash<>v_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('planId',v_receipt.plan_id,
     'revision',v_receipt.revision,'replayed',true);
 END IF;

 SELECT s.archived_at INTO v_student_archived FROM public.students s
  WHERE s.id=p_student_id AND s.teacher_id=v_teacher FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF p_plan_id IS NULL THEN
   IF v_student_archived IS NOT NULL THEN RAISE EXCEPTION 'STUDENT_ARCHIVED'; END IF;
   INSERT INTO public.student_training_plans
      (teacher_id,student_id,title,summary,status,goals)
   VALUES(v_teacher,p_student_id,btrim(p_title),coalesce(p_summary,''),p_status,p_goals)
   RETURNING id,revision INTO v_id,v_revision;
 ELSE
   SELECT * INTO v_existing FROM public.student_training_plans
    WHERE id=p_plan_id AND teacher_id=v_teacher FOR UPDATE;
   IF NOT FOUND OR v_existing.student_id<>p_student_id
      THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
   IF v_existing.revision<>p_expected_revision THEN RAISE EXCEPTION 'STALE_REVISION'; END IF;
   UPDATE public.student_training_plans
     SET title=btrim(p_title),summary=coalesce(p_summary,''),
       status=p_status,goals=p_goals,revision=revision+1,
       updated_at=clock_timestamp()
     WHERE id=p_plan_id AND teacher_id=v_teacher
     RETURNING id,revision INTO v_id,v_revision;
 END IF;
 INSERT INTO public.student_training_plan_revisions(teacher_id,plan_id,revision,snapshot)
 SELECT v_teacher,v_id,v_revision,jsonb_build_object(
   'title',p.title,'summary',p.summary,'status',p.status,'goals',p.goals,
   'studentId',p.student_id,'revision',p.revision)
 FROM public.student_training_plans p WHERE p.id=v_id AND p.teacher_id=v_teacher;
 INSERT INTO public.student_training_plan_receipts
   (teacher_id,request_id,request_hash,plan_id,revision)
 VALUES(v_teacher,p_request_id,v_hash,v_id,v_revision);
 RETURN jsonb_build_object('planId',v_id,'revision',v_revision,'replayed',false);
END;
$commit$;
REVOKE ALL ON FUNCTION public.ccp_student_training_plan_commit(
 uuid,bigint,uuid,text,text,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_student_training_plan_commit(
 uuid,bigint,uuid,text,text,text,jsonb,uuid) TO authenticated;

-- Current teacher backup includes canonical chess
-- materials, assignments, student plans and explicit coaching evidence.
-- This does not restore OAuth credentials or receipt tables.
--
-- The helper is SECURITY DEFINER because regular authenticated users have
-- SELECT-only access to the new evidence tables: all ordinary mutations are
-- restricted to owner-derived domain RPCs with revision and approval checks.
-- Restoration is an explicit, audited coach-owned operation using one
-- authenticated backup receipt; the helper enforces teacher ownership and
-- checks each upsert target before allowing a conflict update.
-- Explicit chess material coverage; linked studies are NOT automatically "taught".
-- The one typed catalog owns material identity; this ledger stores only explicit teaching evidence.
CREATE TABLE public.material_teaching_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id),
  workplace_id uuid REFERENCES public.workplaces(id),
  session_id uuid REFERENCES public.teaching_sessions(id),
  material_id uuid NOT NULL,
  CONSTRAINT material_evidence_material_owner_fk
   FOREIGN KEY(teacher_id,material_id) REFERENCES public.learning_materials(teacher_id,id)
   ON DELETE RESTRICT,
  stage text NOT NULL CHECK (stage IN ('assigned','taught','completed')),
  occurred_on date NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  void_reason text CHECK (void_reason IS NULL OR (char_length(btrim(void_reason)) BETWEEN 5 AND 500)),
  CONSTRAINT material_teaching_evidence_request UNIQUE (teacher_id,request_id),
  CONSTRAINT material_teaching_evidence_void_pair CHECK
    ((voided_at IS NULL) = (void_reason IS NULL))
);
CREATE INDEX material_teaching_evidence_student_idx
 ON public.material_teaching_evidence(teacher_id,student_id,occurred_on DESC,id);
CREATE INDEX material_teaching_evidence_workplace_idx
 ON public.material_teaching_evidence(teacher_id,workplace_id,occurred_on DESC,id);
CREATE INDEX material_teaching_evidence_session_idx
 ON public.material_teaching_evidence(teacher_id,session_id);

ALTER TABLE public.material_teaching_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY material_teaching_evidence_owner ON public.material_teaching_evidence
 FOR ALL TO authenticated USING (teacher_id = auth.uid())
 WITH CHECK (teacher_id = auth.uid());
GRANT SELECT,INSERT,UPDATE ON public.material_teaching_evidence TO authenticated;
GRANT ALL ON public.material_teaching_evidence TO service_role;

-- Bound each student's material claim to teacher-owned typed materials/rosters/workplace.
-- The trigger also protects direct browser Supabase writes, not just MCP or API.
CREATE FUNCTION public.ccp_material_evidence_validate() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_workplace uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.teacher_id,NEW.student_id,NEW.workplace_id,NEW.session_id,
        NEW.material_id,NEW.stage,NEW.occurred_on,NEW.note,NEW.request_id,
        NEW.created_at)
      IS DISTINCT FROM
       (OLD.teacher_id,OLD.student_id,OLD.workplace_id,OLD.session_id,
        OLD.material_id,OLD.stage,OLD.occurred_on,OLD.note,OLD.request_id,
        OLD.created_at) THEN
      RAISE EXCEPTION 'MATERIAL_HISTORY_IMMUTABLE';
    END IF;
    IF OLD.voided_at IS NOT NULL OR NEW.voided_at IS NULL OR
       NEW.void_reason IS NULL OR length(btrim(NEW.void_reason)) < 5 THEN
      RAISE EXCEPTION 'INVALID_MATERIAL_VOID';
    END IF;
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
  END IF;
  PERFORM 1 FROM public.students
   WHERE id=NEW.student_id AND teacher_id=NEW.teacher_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND_STUDENT'; END IF;
  PERFORM 1 FROM public.learning_materials
    WHERE id=NEW.material_id AND teacher_id=NEW.teacher_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND_ACTIVE_MATERIAL'; END IF;
  IF NEW.workplace_id IS NOT NULL THEN
    PERFORM 1 FROM public.workplaces WHERE id=NEW.workplace_id AND teacher_id=NEW.teacher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND_WORKPLACE'; END IF;
  END IF;
  IF NEW.session_id IS NOT NULL THEN
    SELECT workplace_id INTO v_workplace FROM public.teaching_sessions
      WHERE id=NEW.session_id AND teacher_id=NEW.teacher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND_SESSION'; END IF;
    IF NEW.workplace_id IS DISTINCT FROM v_workplace THEN
      RAISE EXCEPTION 'SESSION_WORKPLACE_MISMATCH';
    END IF;
    PERFORM 1 FROM public.session_participants
      WHERE teacher_id=NEW.teacher_id AND session_id=NEW.session_id
        AND student_id=NEW.student_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_SESSION_PARTICIPANT'; END IF;
  ELSIF NEW.workplace_id IS NOT NULL THEN
    PERFORM 1 FROM public.workplace_enrollments
      WHERE teacher_id=NEW.teacher_id AND workplace_id=NEW.workplace_id
        AND student_id=NEW.student_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_WORKPLACE_ENROLLED'; END IF;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER ccp_material_evidence_validate_trg
 BEFORE INSERT OR UPDATE ON public.material_teaching_evidence
 FOR EACH ROW EXECUTE FUNCTION public.ccp_material_evidence_validate();
REVOKE ALL ON FUNCTION public.ccp_material_evidence_validate() FROM PUBLIC,anon,authenticated;


CREATE FUNCTION public.ccp_restore_canonical_chess_rows(p_tables jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path='' AS $restore_chess$
DECLARE
 v_teacher uuid := auth.uid();
 v_table text;
 v_rows jsonb;
 v_row jsonb;
 v_goal jsonb;
 v_goal_key text;
 v_pkeys text;
 v_columns text;
 v_updates text;
 v_count integer;
 v_changed integer;
 v_guard text;
 v_counts jsonb:='{}'::jsonb;
BEGIN
 IF v_teacher IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.teachers WHERE id=v_teacher
 ) THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_tables) <> 'object' OR
    pg_column_size(p_tables)>2097152
 THEN RAISE EXCEPTION 'IMPORT_VALIDATION_ERROR' USING ERRCODE='22023'; END IF;

 -- Safe deterministic FK order: no untyped table names or arbitrary SQL.
 FOREACH v_table IN ARRAY ARRAY[
   'learning_materials','chess_games','chess_puzzles','chess_drills',
   'chess_study_chapters','learning_material_relations',
   'material_links','material_teaching_evidence','training_assignments','assignment_attempts','assignment_reviews',
   'student_training_plans','student_training_plan_revisions'
 ] LOOP
   v_rows := p_tables -> v_table;
   IF v_rows IS NULL THEN CONTINUE; END IF;
   IF jsonb_typeof(v_rows)<>'array' OR jsonb_array_length(v_rows)>20000
   THEN RAISE EXCEPTION 'IMPORT_INVALID_TABLE:%',v_table USING ERRCODE='22023'; END IF;

   SELECT string_agg(format('%I',a.attname),', ' ORDER BY cols.ordinality)
     INTO v_pkeys
   FROM pg_index i
   CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY cols(attnum,ordinality)
   JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=cols.attnum
   WHERE i.indrelid=format('public.%I',v_table)::regclass AND i.indisprimary;
   IF v_pkeys IS NULL THEN RAISE EXCEPTION 'IMPORT_UNSUPPORTED_TABLE:%',v_table; END IF;

   v_count:=0;
   FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
     IF jsonb_typeof(v_row)<>'object'
     THEN RAISE EXCEPTION 'IMPORT_INVALID_ROW:%',v_table USING ERRCODE='22023'; END IF;

     -- The teacher identity is *always* the signed-in person. Copying foreign
     -- IDs to another owner never grants access to the old user's data.
     v_row:=jsonb_set(v_row,'{teacher_id}',to_jsonb(v_teacher::text),true);
     -- A stale snapshot cannot erase newer audit revisions or teacher decisions.
     IF v_table='learning_materials' AND EXISTS(
       SELECT 1 FROM public.learning_materials m
       WHERE m.teacher_id=v_teacher AND m.id=(v_row->>'id')::uuid
         AND m.revision>(v_row->>'revision')::bigint
     ) THEN RAISE EXCEPTION 'IMPORT_STALE_MATERIAL' USING ERRCODE='22023'; END IF;
     IF v_table='student_training_plans' AND EXISTS(
       SELECT 1 FROM public.student_training_plans p
       WHERE p.teacher_id=v_teacher AND p.id=(v_row->>'id')::uuid
         AND p.revision>(v_row->>'revision')::bigint
     ) THEN RAISE EXCEPTION 'IMPORT_STALE_TRAINING_PLAN' USING ERRCODE='22023'; END IF;

     -- Goals are teacher attestations, not machine-inferred scores; importing
     -- a snapshot cannot evade the proof required by normal plan commits.
     IF v_table='student_training_plans' THEN
       IF jsonb_typeof(v_row->'goals')<>'array' OR
          jsonb_array_length(v_row->'goals')>20
       THEN RAISE EXCEPTION 'IMPORT_INVALID_GOALS' USING ERRCODE='22023'; END IF;
       FOR v_goal IN SELECT value FROM jsonb_array_elements(v_row->'goals') LOOP
         IF jsonb_typeof(v_goal)<>'object' OR
            coalesce(v_goal->>'status','') NOT IN
              ('planned','in_progress','achieved','abandoned') OR
            char_length(btrim(coalesce(v_goal->>'title',''))) NOT BETWEEN 1 AND 160 OR
            (v_goal->>'status'='achieved' AND
             char_length(btrim(coalesce(v_goal->>'coachEvidence','')))<10)
         THEN RAISE EXCEPTION 'IMPORT_INVALID_GOAL' USING ERRCODE='22023'; END IF;
         FOR v_goal_key IN SELECT jsonb_object_keys(v_goal) LOOP
           IF v_goal_key NOT IN ('id','title','status','targetDate','coachEvidence')
           THEN RAISE EXCEPTION 'IMPORT_INVALID_GOAL_FIELD' USING ERRCODE='22023'; END IF;
         END LOOP;
       END LOOP;
     END IF;

     -- Plan revision snapshots are immutable teacher attestations. Imports
     -- can replay the same snapshot, never rewrite an existing revision.
     IF v_table='student_training_plan_revisions' AND (
       v_row->>'revision' IS NULL OR
       (v_row->'snapshot'->>'revision') IS DISTINCT FROM (v_row->>'revision')
     ) THEN RAISE EXCEPTION 'IMPORT_INVALID_PLAN_REVISION' USING ERRCODE='22023'; END IF;

     SELECT string_agg(format('%I',field),', ' ORDER BY field),
            string_agg(format('%I = EXCLUDED.%I',field,field),', ' ORDER BY field)
       INTO v_columns,v_updates
     FROM jsonb_object_keys(v_row) AS keys(field);
     IF v_columns IS NULL
     THEN RAISE EXCEPTION 'IMPORT_EMPTY_ROW:%',v_table USING ERRCODE='22023'; END IF;

     -- A conflict with an ID owned by another tenant updates zero rows and
     -- fails the *entire* restore. All FK relations have teacher-scoped keys.
     v_guard:=CASE
       WHEN v_table='student_training_plan_revisions'
         THEN ' AND dst.snapshot = EXCLUDED.snapshot'
       WHEN v_table IN ('assignment_attempts','assignment_reviews')
         THEN ' AND dst.request_hash = EXCLUDED.request_hash'
       ELSE '' END;
     EXECUTE format(
       'INSERT INTO public.%I AS dst (%s)
          SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1)
          ON CONFLICT (%s) DO UPDATE SET %s WHERE dst.teacher_id = $2 %s',
       v_table,v_columns,v_columns,v_table,v_pkeys,v_updates,v_guard
     ) USING v_row,v_teacher;
     GET DIAGNOSTICS v_changed=ROW_COUNT;
     IF v_changed<>1 THEN
       RAISE EXCEPTION 'IMPORT_FOREIGN_RECORD:%',v_table USING ERRCODE='42501';
     END IF;
     v_count:=v_count+1;
   END LOOP;
   v_counts:=jsonb_set(v_counts,ARRAY[v_table],to_jsonb(v_count),true);
 END LOOP;
 RETURN v_counts;
END;
$restore_chess$;

REVOKE ALL ON FUNCTION public.ccp_restore_canonical_chess_rows(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_restore_canonical_chess_rows(jsonb)
 TO authenticated;

-- Current-schema portable restore is one all-or-nothing authenticated operation.
-- The source table list is fixed and both clients share a single receipt.
CREATE OR REPLACE FUNCTION public.ccp_teacher_backup_restore(
  p_tables jsonb, p_display_name text, p_digest text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE
  v_teacher uuid := auth.uid();
  v_table text;
  v_source jsonb;
  v_row jsonb;
  v_rows jsonb;
  v_columns text;
  v_updates text;
  v_pkeys text;
  v_count integer;
  v_updated integer;
  v_counts jsonb := '{}'::jsonb;
  v_result jsonb;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_tables) IS DISTINCT FROM 'object'
    OR p_digest !~ '^[a-f0-9]{64}$' OR p_digest IS NULL
    OR pg_column_size(p_tables) > 2097152 THEN
    RAISE EXCEPTION 'IMPORT_VALIDATION_ERROR' USING ERRCODE = '22023';
  END IF;

  -- Independent backups for the same teacher cannot interleave; the receipt
  -- insert also serializes concurrent retries of an identical approved digest.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_teacher::text, 0));
  INSERT INTO public.teacher_backup_import_receipts (teacher_id, digest, result)
  VALUES (v_teacher, p_digest, '{}'::jsonb) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT result INTO v_result FROM public.teacher_backup_import_receipts
    WHERE teacher_id = v_teacher AND digest = p_digest;
    IF v_result IS NULL THEN
      RAISE EXCEPTION 'IMPORT_RECEIPT_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_result;
  END IF;

  -- Match the portable backup's FK-safe ordering. The list is fixed in SQL;
  -- arbitrary JSON table names are ignored, never interpolated into SQL.
  FOREACH v_table IN ARRAY ARRAY[
    'studio_policies', 'guardians', 'students', 'workplaces', 'class_groups',
    'workplace_enrollments', 'group_enrollments', 'teaching_sessions',
    'session_participants', 'session_attendance', 'chess_skill_categories',
    'chess_observations', 'lesson_slots', 'lessons',
    'attendance', 'lesson_notes', 'skill_dimensions', 'skill_assessments',
    'invoices', 'invoice_items', 'payments', 'events', 'event_students',
    'event_rsvps', 'credit_packages', 'credit_redemptions'
  ] LOOP
    v_source := p_tables -> v_table;
    IF v_table = 'studio_policies' THEN
      IF v_source IS NULL OR v_source = 'null'::jsonb THEN
        v_rows := '[]'::jsonb;
      ELSIF jsonb_typeof(v_source) = 'object' THEN
        v_rows := jsonb_build_array(v_source);
      ELSE
        RAISE EXCEPTION 'IMPORT_INVALID_TABLE:%', v_table USING ERRCODE='22023';
      END IF;
    ELSIF v_source IS NULL THEN
      v_rows := '[]'::jsonb;
    ELSIF jsonb_typeof(v_source) = 'array' THEN
      v_rows := v_source;
    ELSE
      RAISE EXCEPTION 'IMPORT_INVALID_TABLE:%', v_table USING ERRCODE='22023';
    END IF;

    v_count := 0;
    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY key_cols.ordinality)
      INTO v_pkeys
    FROM pg_index i
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS key_cols(attnum, ordinality)
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = key_cols.attnum
    WHERE i.indrelid = format('public.%I', v_table)::regclass AND i.indisprimary;
    IF v_pkeys IS NULL THEN
      RAISE EXCEPTION 'IMPORT_UNSUPPORTED_TABLE:%', v_table USING ERRCODE='22023';
    END IF;

    FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
      IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'IMPORT_INVALID_ROW:%', v_table USING ERRCODE='22023';
      END IF;
      IF v_table = ANY(ARRAY[
        'studio_policies', 'guardians', 'students', 'workplaces', 'class_groups',
        'workplace_enrollments', 'group_enrollments', 'teaching_sessions',
        'session_participants', 'session_attendance', 'chess_skill_categories',
        'chess_observations', 'lesson_slots', 'lessons',
        'skill_dimensions', 'invoices', 'events', 'credit_packages',
        'credit_redemptions'
      ]) THEN
        v_row := jsonb_set(v_row, '{teacher_id}', to_jsonb(v_teacher::text), true);
      END IF;
      IF v_table = 'studio_policies' THEN
        v_row := v_row - 'stripe_secret_key' - 'stripe_publishable_key'
                 - 'stripe_webhook_secret' - 'ai_api_key';
      END IF;
      IF v_table = 'guardians'
        AND nullif(btrim(v_row ->> 'portal_token'), '') IS NULL THEN
        v_row := jsonb_set(v_row, '{portal_token}', to_jsonb(
          rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/', '-_'), '=')
        ), true);
      END IF;

      -- Insert only supplied columns so database defaults survive sparse
      -- portable exports. PostgreSQL performs the whole operation under RLS:
      -- a foreign owner's ID cannot be overwritten or attached via child FK.
      SELECT string_agg(format('%I', field), ', ' ORDER BY field),
             string_agg(format('%I = EXCLUDED.%I', field, field), ', ' ORDER BY field)
        INTO v_columns, v_updates
      FROM jsonb_object_keys(v_row) AS keys(field);
      IF v_columns IS NULL THEN
        RAISE EXCEPTION 'IMPORT_EMPTY_ROW:%', v_table USING ERRCODE='22023';
      END IF;
      EXECUTE format(
        'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) ON CONFLICT (%s) DO UPDATE SET %s',
        v_table, v_columns, v_columns, v_table, v_pkeys, v_updates
      ) USING v_row;
      v_count := v_count + 1;
    END LOOP;
    v_counts := jsonb_set(v_counts, ARRAY[v_table], to_jsonb(v_count), true);
  END LOOP;

  IF nullif(btrim(p_display_name), '') IS NOT NULL THEN
    UPDATE public.teachers SET display_name = btrim(p_display_name)
    WHERE id = v_teacher AND nullif(btrim(display_name), '') IS NULL;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 1 THEN
      v_counts := jsonb_set(v_counts, '{teacher_profile}', '1'::jsonb, true);
    END IF;
  END IF;
  -- Include typed chess data in the SAME database transaction and receipt.
  -- If any new table fails, existing schedules/finance/history are rolled back.
  v_counts := v_counts || public.ccp_restore_canonical_chess_rows(p_tables);
  v_result := jsonb_build_object('counts', v_counts);
  UPDATE public.teacher_backup_import_receipts SET result = v_result
  WHERE teacher_id = v_teacher AND digest = p_digest;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_teacher_backup_restore(jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ccp_teacher_backup_restore(jsonb, text, text) TO authenticated;


-- Canonical, teacher-scoped skill-dimension creation.
-- A request UUID binds one immutable creation payload to one stable result;
-- retries across browser and delegated MCP cannot create duplicate dimensions.
CREATE TABLE public.skill_dimension_create_receipts (
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  payload jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id,request_id)
);
ALTER TABLE public.skill_dimension_create_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.skill_dimension_create_receipts FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.ccp_skill_dimension_create(
  p_name text,p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid:=auth.uid();
  v_name text:=btrim(coalesce(p_name,''));
  v_payload jsonb;
  v_old_payload jsonb;
  v_old_result jsonb;
  v_id uuid;
  v_order integer;
  v_result jsonb;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 120 OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_SKILL_DIMENSION' USING ERRCODE='22023';
  END IF;
  v_payload:=jsonb_build_object('name',v_name);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_teacher::text||':skill-dimension-request:'||p_request_id::text,0));
  SELECT payload,result INTO v_old_payload,v_old_result
  FROM public.skill_dimension_create_receipts
  WHERE teacher_id=v_teacher AND request_id=p_request_id;
  IF FOUND THEN
    IF v_old_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'SKILL_DIMENSION_REQUEST_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN v_old_result;
  END IF;

  -- Serialize a teacher's sort-order allocation, even for distinct requests.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_teacher::text||':skill-dimension-sort',0));
  SELECT coalesce(max(sort_order),-1)+1 INTO v_order
  FROM public.skill_dimensions WHERE teacher_id=v_teacher;
  INSERT INTO public.skill_dimensions(teacher_id,name,sort_order)
  VALUES(v_teacher,v_name,v_order)
  RETURNING id INTO v_id;
  v_result:=jsonb_build_object('id',v_id,'name',v_name,'sort_order',v_order);
  INSERT INTO public.skill_dimension_create_receipts(teacher_id,request_id,payload,result)
  VALUES(v_teacher,p_request_id,v_payload,v_result);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_skill_dimension_create(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_skill_dimension_create(text,uuid) TO authenticated;

-- One shared invoice void writer for teacher website and delegated MCP.
-- Locks the invoice against cash settlement and the associated prepaid
-- packages against concurrent redemption. Void cannot silently erase money,
-- credits or an active Stripe checkout. Owner is always auth.uid().
CREATE OR REPLACE FUNCTION public.ccp_invoice_void(
 p_invoice_id uuid,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $invoice_void$
DECLARE
 v_teacher uuid:=auth.uid();
 v_invoice public.invoices%ROWTYPE;
 v_old public.agent_tool_receipts%ROWTYPE;
 v_package record;
 v_hash text;
 v_receipt jsonb;
BEGIN
 IF v_teacher IS NULL THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
 END IF;
 IF p_invoice_id IS NULL OR p_request_id IS NULL THEN
   RAISE EXCEPTION 'INVALID_INVOICE_VOID_REQUEST' USING ERRCODE='22023';
 END IF;
 v_hash:=md5(jsonb_build_array('billing.invoice.void',p_invoice_id)::text);
 INSERT INTO public.agent_tool_receipts(
   teacher_id,idempotency_key,operation,request_hash,receipt
 ) VALUES(v_teacher,p_request_id,'billing.invoice.void',v_hash,'{}'::jsonb)
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN
   SELECT * INTO v_old FROM public.agent_tool_receipts
   WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
   IF NOT FOUND OR v_old.operation<>'billing.invoice.void' OR
      v_old.request_hash<>v_hash THEN
     RAISE EXCEPTION 'INVOICE_VOID_REQUEST_CONFLICT' USING ERRCODE='23505';
   END IF;
   RETURN v_old.receipt||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO v_invoice FROM public.invoices
  WHERE id=p_invoice_id AND teacher_id=v_teacher FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF v_invoice.status='paid' THEN
   RAISE EXCEPTION 'INVOICE_PAID_CANNOT_VOID' USING ERRCODE='23514';
 END IF;
 IF v_invoice.status='void' THEN
   v_receipt:=jsonb_build_object('ok',true,'alreadyVoid',true,
     'invoiceId',p_invoice_id,'idempotencyKey',p_request_id);
 ELSE
   IF EXISTS(SELECT 1 FROM public.payments
      WHERE invoice_id=p_invoice_id) THEN
     RAISE EXCEPTION 'INVOICE_HAS_PAYMENTS' USING ERRCODE='23514';
   END IF;
   IF v_invoice.stripe_checkout_session_id IS NOT NULL OR
      v_invoice.stripe_checkout_url IS NOT NULL OR
      v_invoice.stripe_payment_intent_id IS NOT NULL THEN
     RAISE EXCEPTION 'CHECKOUT_RECONCILIATION_REQUIRED' USING ERRCODE='23514';
   END IF;
   -- A FK INSERT into credit_redemptions needs KEY SHARE on its package.
   -- FOR UPDATE excludes that competing insert until this transaction ends.
   FOR v_package IN SELECT id FROM public.credit_packages
      WHERE invoice_id=p_invoice_id AND teacher_id=v_teacher FOR UPDATE LOOP
     IF EXISTS(SELECT 1 FROM public.credit_redemptions
       WHERE package_id=v_package.id AND teacher_id=v_teacher) THEN
       RAISE EXCEPTION 'CREDITS_USED' USING ERRCODE='23514';
     END IF;
     -- Even unused issued credits must first be cancelled/reconciled.
     RAISE EXCEPTION 'CREDIT_PACKAGE_EXISTS' USING ERRCODE='23514';
   END LOOP;
   UPDATE public.invoices SET status='void'
     WHERE id=p_invoice_id AND teacher_id=v_teacher AND
       status IN ('draft','sent');
   IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_VOID_STATUS_CHANGED' USING ERRCODE='23505'; END IF;
   v_receipt:=jsonb_build_object('ok',true,'alreadyVoid',false,
     'invoiceId',p_invoice_id,'idempotencyKey',p_request_id);
 END IF;
 UPDATE public.agent_tool_receipts SET receipt=v_receipt
   WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
 RETURN v_receipt||jsonb_build_object('replayed',false);
END;
$invoice_void$;
REVOKE ALL ON FUNCTION public.ccp_invoice_void(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_invoice_void(uuid,uuid) TO authenticated;


-- Only the current owner may attach a processor Checkout Session to the
-- unchanged, still-payable balance. Both website and MCP call this after the
-- provider has created a session. A session cannot replace another link.
CREATE OR REPLACE FUNCTION public.ccp_invoice_checkout_claim(
 p_invoice_id uuid,p_session_id text,p_checkout_url text,
 p_expected_balance integer,p_expected_updated_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $checkout_claim$
DECLARE
 v_teacher uuid:=auth.uid();
 v_invoice public.invoices%ROWTYPE;
 v_paid bigint;
BEGIN
 IF v_teacher IS NULL THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';END IF;
 IF p_invoice_id IS NULL OR p_expected_updated_at IS NULL OR
   p_expected_balance IS NULL OR p_expected_balance<=0 OR
   p_session_id IS NULL OR length(p_session_id)>255 OR
   p_session_id NOT LIKE 'cs_%' OR
   p_checkout_url IS NULL OR length(p_checkout_url)>2048 OR
   p_checkout_url NOT LIKE 'https://checkout.stripe.com/%' THEN
   RAISE EXCEPTION 'INVALID_CHECKOUT_LINK' USING ERRCODE='22023';END IF;
 SELECT * INTO v_invoice FROM public.invoices
   WHERE id=p_invoice_id AND teacher_id=v_teacher FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';END IF;
 IF v_invoice.status NOT IN ('draft','sent') OR
    v_invoice.stripe_payment_intent_id IS NOT NULL THEN
   RAISE EXCEPTION 'CHECKOUT_RECONCILIATION_REQUIRED' USING ERRCODE='23514';END IF;
 IF v_invoice.stripe_checkout_session_id IS NOT NULL OR
    v_invoice.stripe_checkout_url IS NOT NULL THEN
   IF v_invoice.stripe_checkout_session_id=p_session_id AND
      v_invoice.stripe_checkout_url=p_checkout_url THEN
     RETURN jsonb_build_object('sessionId',p_session_id,'url',p_checkout_url);
   END IF;
   RAISE EXCEPTION 'CHECKOUT_ALREADY_LINKED' USING ERRCODE='23505';
 END IF;
 IF v_invoice.updated_at IS DISTINCT FROM p_expected_updated_at THEN
   RAISE EXCEPTION 'STALE_INVOICE_REVISION' USING ERRCODE='23505';END IF;
 SELECT COALESCE(SUM(amount_cents),0) INTO v_paid FROM public.payments
   WHERE invoice_id=p_invoice_id;
 IF v_invoice.subtotal_cents-v_paid<>p_expected_balance THEN
   RAISE EXCEPTION 'CHECKOUT_BALANCE_CHANGED' USING ERRCODE='23505';END IF;
 UPDATE public.invoices
   SET stripe_checkout_session_id=p_session_id,stripe_checkout_url=p_checkout_url
   WHERE id=p_invoice_id AND teacher_id=v_teacher;
 RETURN jsonb_build_object('sessionId',p_session_id,'url',p_checkout_url);
END;
$checkout_claim$;
REVOKE ALL ON FUNCTION public.ccp_invoice_checkout_claim(
 uuid,text,text,integer,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_invoice_checkout_claim(
 uuid,text,text,integer,timestamptz) TO authenticated;


-- Canonical recurrence materialization: a single owner-validated database
-- transaction for private lesson occurrences. The unique slot/date index
-- prevents a rescheduled occurrence from being re-created at its old date.
-- The database rechecks every planned local time and frozen roster owner.
CREATE OR REPLACE FUNCTION public.ccp_canonical_slot_materialize(p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $ccp_materialize$
DECLARE
  v_teacher uuid := auth.uid();
  v_row jsonb;
  v_slot public.lesson_slots%ROWTYPE;
  v_workplace public.workplaces%ROWTYPE;
  v_slot_date date;
  v_starts timestamptz;
  v_id uuid;
  v_workplace_id uuid;
  v_timezone text;
  v_count integer := 0;
  v_inserted integer := 0;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_rows) > 2000
     OR pg_column_size(p_rows) > 1500000 THEN
    RAISE EXCEPTION 'CANONICAL_MATERIALIZE_INVALID_REQUEST'
      USING ERRCODE='22023';
  END IF;
  -- Use the same teacher schedule lock as all other session writers.
  -- Checking identity before INSERT avoids the BEFORE INSERT overlap guard
  -- rejecting a valid ON CONFLICT DO NOTHING replay.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_teacher::text,0));
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(v_row) IS DISTINCT FROM 'object'
       OR v_row->>'slot_id' IS NULL
       OR v_row->>'slot_occurrence_date' IS NULL
       OR v_row->>'starts_at' IS NULL
       OR v_row->>'workplace_id' IS NULL THEN
      RAISE EXCEPTION 'CANONICAL_MATERIALIZE_INVALID_ROW'
        USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_slot FROM public.lesson_slots
     WHERE id=(v_row->>'slot_id')::uuid AND teacher_id=v_teacher
     FOR KEY SHARE;
    IF NOT FOUND OR NOT v_slot.active
      OR v_slot.student_id IS DISTINCT FROM (v_row->>'student_id')::uuid
      OR v_slot.teacher_id IS DISTINCT FROM (v_row->>'teacher_id')::uuid THEN
      RAISE EXCEPTION 'CANONICAL_MATERIALIZE_SLOT_NOT_OWNED'
        USING ERRCODE='42501';
    END IF;
    v_workplace_id := (v_row->>'workplace_id')::uuid;
    SELECT * INTO v_workplace FROM public.workplaces
      WHERE id=v_workplace_id AND teacher_id=v_teacher FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CANONICAL_MATERIALIZE_WORKPLACE_NOT_OWNED'
        USING ERRCODE='42501';
    END IF;
    IF v_slot.workplace_id IS NOT NULL THEN
      IF v_slot.workplace_id <> v_workplace_id THEN
        RAISE EXCEPTION 'CANONICAL_MATERIALIZE_WRONG_WORKPLACE'
          USING ERRCODE='22023';
      END IF;
      v_timezone := v_workplace.timezone;
    ELSE
      SELECT id INTO v_id FROM public.workplaces
        WHERE teacher_id=v_teacher ORDER BY created_at,id LIMIT 1;
      IF v_id IS DISTINCT FROM v_workplace_id THEN
        RAISE EXCEPTION 'CANONICAL_MATERIALIZE_WRONG_PERSONAL_WORKPLACE'
          USING ERRCODE='22023';
      END IF;
      SELECT timezone INTO v_timezone FROM public.studio_policies
        WHERE teacher_id=v_teacher;
      v_timezone := coalesce(nullif(v_timezone,''),v_workplace.timezone);
    END IF;
    IF v_row->>'slot_occurrence_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'CANONICAL_MATERIALIZE_INVALID_DATE'
        USING ERRCODE='22023';
    END IF;
    v_slot_date := (v_row->>'slot_occurrence_date')::date;
    v_starts := (v_row->>'starts_at')::timestamptz;
    IF v_slot_date < v_slot.start_date
       OR (v_slot.end_date IS NOT NULL AND v_slot_date > v_slot.end_date)
       OR extract(dow from v_slot_date) <> v_slot.day_of_week
       OR (v_starts AT TIME ZONE v_timezone)::date <> v_slot_date
       OR (v_starts AT TIME ZONE v_timezone)::time <> v_slot.start_time
       OR (v_row->>'duration_minutes')::integer <> v_slot.duration_minutes
       OR (v_row->>'is_home_visit')::boolean IS DISTINCT FROM v_slot.is_home_visit
       OR (v_row->>'local_timezone') IS DISTINCT FROM v_timezone
       OR (v_row->>'slot_rate_cents')::integer IS DISTINCT FROM v_slot.rate_cents THEN
      RAISE EXCEPTION 'CANONICAL_MATERIALIZE_SLOT_MISMATCH'
        USING ERRCODE='22023';
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.teaching_sessions
       WHERE teacher_id=v_teacher AND slot_id=v_slot.id
         AND slot_occurrence_date=v_slot_date
    ) THEN
      v_count:=v_count+1;
      CONTINUE;
    END IF;
    INSERT INTO public.teaching_sessions(
      teacher_id,workplace_id,student_id,title,starts_at,duration_minutes,
      status,slot_id,slot_occurrence_date,local_timezone,is_home_visit,slot_rate_cents
    ) VALUES(
      v_teacher,v_workplace_id,v_slot.student_id,'Private chess lesson',
      v_starts,v_slot.duration_minutes,'scheduled',v_slot.id,v_slot_date,
      v_timezone,v_slot.is_home_visit,v_slot.rate_cents
    ) ON CONFLICT (slot_id,slot_occurrence_date) DO NOTHING;
    v_count := v_count+1;
    IF FOUND THEN v_inserted := v_inserted+1; END IF;
  END LOOP;
  RETURN jsonb_build_object('planned',v_count,'inserted',v_inserted);
END;
$ccp_materialize$;
REVOKE ALL ON FUNCTION public.ccp_canonical_slot_materialize(jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_canonical_slot_materialize(jsonb)
  TO authenticated;

-- Durable notification intents. Only the trusted delivery worker with
-- service-role credentials can read, claim or acknowledge messages. No
-- family-private teacher notes or access tokens are placed in payload.
CREATE TABLE public.ccp_delivery_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.teaching_sessions(id) ON DELETE RESTRICT,
  student_id uuid,
  event_key text NOT NULL CHECK (char_length(event_key) BETWEEN 12 AND 200),
  kind text NOT NULL CHECK (kind IN ('session_note_family','session_cancel_family',
                                     'portal_cancel_teacher')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','sending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  UNIQUE (teacher_id,event_key),
  FOREIGN KEY (session_id,student_id) REFERENCES public.session_participants
    (session_id,student_id) ON DELETE RESTRICT
);
CREATE INDEX ccp_delivery_outbox_pending_idx
  ON public.ccp_delivery_outbox(state,created_at)
  WHERE state IN ('pending','failed');
ALTER TABLE public.ccp_delivery_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ccp_delivery_outbox FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.ccp_delivery_outbox TO service_role;

-- Note revisions are append-only internal evidence; the guardian portal and
-- delegated clients must never obtain teacher-private fields from this table.
CREATE TABLE public.ccp_session_note_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.teaching_sessions(id) ON DELETE RESTRICT,
  note_id uuid NOT NULL REFERENCES public.session_notes(id) ON DELETE RESTRICT,
  student_id uuid,
  request_id uuid NOT NULL,
  before_value jsonb,
  after_value jsonb NOT NULL,
  written_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (teacher_id,request_id)
);
ALTER TABLE public.ccp_session_note_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ccp_session_note_audit FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.ccp_session_note_audit TO service_role;

-- Same canonical note command for the website and delegated MCP. The
-- optimistic revision is checked under the session row lock. Only approved
-- guardian-shareable fields can become notification intents.
CREATE OR REPLACE FUNCTION public.ccp_canonical_session_note_save(
  p_session_id uuid,p_student_id uuid,p_body text,p_private_body text,
  p_share_with_guardian boolean,p_send_email boolean,
  p_expected_updated_at timestamptz,p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $ccp_session_note$
DECLARE
  v_teacher uuid := auth.uid();
  v_session public.teaching_sessions%ROWTYPE;
  v_note public.session_notes%ROWTYPE;
  v_saved public.agent_tool_receipts%ROWTYPE;
  v_before jsonb;
  v_hash text;
  v_receipt jsonb;
  v_event_key text;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF p_session_id IS NULL OR p_idempotency_key IS NULL
    OR p_body IS NULL OR p_private_body IS NULL
    OR char_length(p_body)>10000 OR char_length(p_private_body)>10000
    OR p_share_with_guardian IS NULL OR p_send_email IS NULL
    OR (p_send_email AND (NOT p_share_with_guardian
                         OR btrim(p_body)=''
                         OR p_student_id IS NULL)) THEN
    RAISE EXCEPTION 'SESSION_NOTE_INVALID_REQUEST' USING ERRCODE='22023';
  END IF;
  v_hash := md5(jsonb_build_array('session.note.save',
    p_session_id,p_student_id,p_body,p_private_body,
    p_share_with_guardian,p_send_email,p_expected_updated_at)::text);
  INSERT INTO public.agent_tool_receipts(
    teacher_id,idempotency_key,operation,request_hash,receipt
  ) VALUES(v_teacher,p_idempotency_key,'session.note.save',v_hash,'{}'::jsonb)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO v_saved FROM public.agent_tool_receipts
      WHERE teacher_id=v_teacher AND idempotency_key=p_idempotency_key;
    IF NOT FOUND OR v_saved.operation<>'session.note.save'
       OR v_saved.request_hash<>v_hash THEN
      RAISE EXCEPTION 'SESSION_NOTE_REPLAY_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN v_saved.receipt || jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO v_session FROM public.teaching_sessions
    WHERE id=p_session_id AND teacher_id=v_teacher FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOTE_NOT_FOUND' USING ERRCODE='42501';
  END IF;
  IF p_student_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.session_participants
      WHERE session_id=p_session_id AND teacher_id=v_teacher
        AND student_id=p_student_id
  ) THEN
    RAISE EXCEPTION 'SESSION_NOTE_PARTICIPANT_NOT_FOUND'
      USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_note FROM public.session_notes
    WHERE teacher_id=v_teacher AND session_id=p_session_id
      AND student_id IS NOT DISTINCT FROM p_student_id FOR UPDATE;
  IF v_note.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'SESSION_NOTE_REVISION_CONFLICT' USING ERRCODE='23505';
  END IF;
  v_before := CASE WHEN v_note.id IS NULL THEN NULL ELSE
    jsonb_build_object('body',v_note.body,'privateBody',v_note.private_body,
       'sharedWithGuardian',v_note.shared_with_guardian) END;
  IF v_note.id IS NULL THEN
    INSERT INTO public.session_notes(
      teacher_id,session_id,student_id,body,private_body,shared_with_guardian
    ) VALUES(v_teacher,p_session_id,p_student_id,p_body,p_private_body,
      p_share_with_guardian) RETURNING * INTO v_note;
  ELSE
    UPDATE public.session_notes
      SET body=p_body,private_body=p_private_body,
        shared_with_guardian=p_share_with_guardian,updated_at=clock_timestamp()
      WHERE id=v_note.id RETURNING * INTO v_note;
  END IF;
  INSERT INTO public.ccp_session_note_audit(
    teacher_id,session_id,student_id,note_id,request_id,
    before_value,after_value
  ) VALUES(v_teacher,p_session_id,p_student_id,v_note.id,
    p_idempotency_key,v_before,jsonb_build_object(
      'body',v_note.body,'privateBody',v_note.private_body,
      'sharedWithGuardian',v_note.shared_with_guardian
    ));
  IF p_send_email THEN
    v_event_key := 'session-note:' || p_idempotency_key::text;
    INSERT INTO public.ccp_delivery_outbox(
      teacher_id,session_id,student_id,event_key,kind,payload
    ) VALUES(
      v_teacher,p_session_id,p_student_id,v_event_key,'session_note_family',
      jsonb_build_object('sessionId',p_session_id,'studentId',p_student_id,
        'body',p_body,'approvedBy',v_teacher,'requestId',p_idempotency_key)
    );
  END IF;
  v_receipt := jsonb_build_object(
    'sessionId',p_session_id,'studentId',p_student_id,
    'noteId',v_note.id,'revision',v_note.updated_at,
    'sharedWithGuardian',v_note.shared_with_guardian,
    'emailQueued',p_send_email,'idempotencyKey',p_idempotency_key
  );
  UPDATE public.agent_tool_receipts SET receipt=v_receipt
    WHERE teacher_id=v_teacher AND idempotency_key=p_idempotency_key;
  RETURN v_receipt || jsonb_build_object('replayed',false);
END;
$ccp_session_note$;
REVOKE ALL ON FUNCTION public.ccp_canonical_session_note_save(
  uuid,uuid,text,text,boolean,boolean,timestamptz,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_canonical_session_note_save(
  uuid,uuid,text,text,boolean,boolean,timestamptz,uuid)
  TO authenticated;


-- Guardian cancellation of ONE frozen participant. A session can remain
-- scheduled for the rest of the group; student cancellation does not cancel
-- the shared teaching occurrence or silently consume a make-up credit.
-- Token ownership, the session lock, attendance insert and notification
-- intents all occur inside one transaction, with no teacher impersonation.
CREATE OR REPLACE FUNCTION public.ccp_canonical_portal_cancel(
  p_portal_token text,p_session_id uuid,p_student_id uuid,p_cancel_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $ccp_portal_cancel$
DECLARE
  v_teacher uuid;
  v_student_name text;
  v_start timestamptz;
  v_status text;
  v_att public.session_attendance%ROWTYPE;
  v_now timestamptz;
  v_notify_in_app boolean := true;
  v_notify_email boolean := false;
BEGIN
  IF p_portal_token IS NULL OR length(p_portal_token) NOT BETWEEN 32 AND 256
     OR p_session_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'PORTAL_NOT_FOUND' USING ERRCODE='42501';
  END IF;
  IF p_cancel_reason IS NULL OR char_length(p_cancel_reason)>1000 THEN
    RAISE EXCEPTION 'PORTAL_INVALID_NOTE' USING ERRCODE='22023';
  END IF;
  SELECT s.teacher_id,st.name,s.starts_at,s.status
    INTO v_teacher,v_student_name,v_start,v_status
    FROM public.teaching_sessions s
    JOIN public.session_participants sp ON sp.session_id=s.id
      AND sp.teacher_id=s.teacher_id AND sp.student_id=p_student_id
    JOIN public.students st ON st.id=sp.student_id
      AND st.teacher_id=s.teacher_id
    JOIN public.guardians g ON g.id=st.guardian_id
      AND g.teacher_id=s.teacher_id
   WHERE s.id=p_session_id AND g.portal_token=p_portal_token
   FOR UPDATE OF s,st,g;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PORTAL_NOT_FOUND' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_att FROM public.session_attendance
   WHERE teacher_id=v_teacher AND session_id=p_session_id
     AND student_id=p_student_id FOR UPDATE;
  IF v_att.id IS NOT NULL THEN
    IF v_att.status='student_cancelled' THEN
      RETURN jsonb_build_object('ok',true,'replayed',true,
        'noticeAt',v_att.notice_at,'cancelReason',v_att.cancel_reason,
        'teacherId',v_teacher,'studentName',v_student_name,
        'startsAt',v_start,'sessionId',p_session_id,
        'studentId',p_student_id);
    END IF;
    RAISE EXCEPTION 'PORTAL_ALREADY_MARKED' USING ERRCODE='23514';
  END IF;
  IF v_status <> 'scheduled' OR v_start <= clock_timestamp() THEN
    RAISE EXCEPTION 'PORTAL_TOO_LATE' USING ERRCODE='22023';
  END IF;
  v_now := clock_timestamp();
  INSERT INTO public.session_attendance(
    teacher_id,session_id,student_id,status,notice_at,
    cancelled_by,cancel_reason,marked_at,marked_by,updated_at
  ) VALUES(v_teacher,p_session_id,p_student_id,'student_cancelled',v_now,
    'student',p_cancel_reason,v_now,NULL,v_now)
    RETURNING * INTO v_att;
  SELECT coalesce(notify_in_app,true),coalesce(notify_email_portal_cancel,false)
    INTO v_notify_in_app,v_notify_email FROM public.studio_policies
    WHERE teacher_id=v_teacher;
  IF v_notify_in_app THEN
    INSERT INTO public.notifications(teacher_id,type,title,body,href)
    VALUES(v_teacher,'portal_cancel','Student cancelled a chess lesson',
      v_student_name||' cancelled the lesson on '||v_start::text,
      '/schedule');
  END IF;
  IF v_notify_email THEN
    INSERT INTO public.ccp_delivery_outbox(
      teacher_id,session_id,student_id,event_key,kind,payload
    ) VALUES(
      v_teacher,p_session_id,p_student_id,
      'portal-cancel:'||p_session_id::text||':'||p_student_id::text,
      'portal_cancel_teacher',
      jsonb_build_object('sessionId',p_session_id,'studentId',p_student_id,
        'studentName',v_student_name,'startsAt',v_start,
        'cancelReason',p_cancel_reason,'noticeAt',v_now)
    );
  END IF;
  RETURN jsonb_build_object('ok',true,'replayed',false,
    'noticeAt',v_att.notice_at,'cancelReason',v_att.cancel_reason,
    'teacherId',v_teacher,'studentName',v_student_name,
    'startsAt',v_start,'sessionId',p_session_id,
    'studentId',p_student_id);
END;
$ccp_portal_cancel$;
REVOKE ALL ON FUNCTION public.ccp_canonical_portal_cancel(
 text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ccp_canonical_portal_cancel(
 text,uuid,uuid,text) TO service_role;


-- Canonical participant-attendance correction and clear. The session row
-- serializes web, delegated MCP, and guardian-originated decisions. The
-- idempotency receipt and every mutation commit (or roll back) together.
CREATE OR REPLACE FUNCTION public.ccp_canonical_attendance_mutate(
  p_session_id uuid,p_student_id uuid,p_status text,p_note text,
  p_notice_at timestamptz,p_cancel_reason text,
  p_expected_updated_at timestamptz,p_idempotency_key uuid,
  p_notify_family boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $ccp_attendance_mutate$
DECLARE
  v_teacher uuid:=auth.uid();
  v_session public.teaching_sessions%ROWTYPE;
  v_att public.session_attendance%ROWTYPE;
  v_receipt jsonb;
  v_hash text;
  v_saved public.agent_tool_receipts%ROWTYPE;
  v_cancelled_by text;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF p_session_id IS NULL OR p_student_id IS NULL OR p_idempotency_key IS NULL
    OR p_note IS NULL OR length(p_note)>5000
    OR p_cancel_reason IS NULL OR length(p_cancel_reason)>1000
    OR p_notify_family IS NULL
    OR (p_status IS NOT NULL AND p_status NOT IN
       ('present','late','absent','excused','student_cancelled','teacher_cancelled'))
    OR (p_status='student_cancelled' AND p_notice_at IS NULL)
    OR (p_status NOT IN ('student_cancelled','teacher_cancelled') OR p_status IS NULL)
       AND (p_notice_at IS NOT NULL OR p_cancel_reason<>'')
    OR (p_status<>'teacher_cancelled' OR p_status IS NULL) AND p_notify_family THEN
      RAISE EXCEPTION 'CANONICAL_ATTENDANCE_INVALID_REQUEST'
        USING ERRCODE='22023';
  END IF;
  v_hash:=md5(jsonb_build_array('canonical.attendance.mutate',
    p_session_id,p_student_id,p_status,p_note,p_notice_at,p_cancel_reason,
    p_expected_updated_at,p_notify_family)::text);
  INSERT INTO public.agent_tool_receipts(
    teacher_id,idempotency_key,operation,request_hash,receipt
  ) VALUES(v_teacher,p_idempotency_key,'canonical.attendance.mutate',
    v_hash,'{}'::jsonb) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO v_saved FROM public.agent_tool_receipts
      WHERE teacher_id=v_teacher AND idempotency_key=p_idempotency_key;
    IF NOT FOUND OR v_saved.operation<>'canonical.attendance.mutate'
       OR v_saved.request_hash<>v_hash THEN
      RAISE EXCEPTION 'CANONICAL_ATTENDANCE_REPLAY_CONFLICT'
        USING ERRCODE='23505';
    END IF;
    RETURN v_saved.receipt||jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO v_session FROM public.teaching_sessions
    WHERE id=p_session_id AND teacher_id=v_teacher FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(
    SELECT 1 FROM public.session_participants
     WHERE teacher_id=v_teacher AND session_id=p_session_id
       AND student_id=p_student_id
  ) THEN
    RAISE EXCEPTION 'CANONICAL_ATTENDANCE_NOT_FOUND'
      USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_att FROM public.session_attendance
    WHERE teacher_id=v_teacher AND session_id=p_session_id
      AND student_id=p_student_id FOR UPDATE;
  IF v_att.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'CANONICAL_ATTENDANCE_REVISION_CONFLICT'
      USING ERRCODE='23505';
  END IF;
  IF p_status IS NULL THEN
    -- Do not silently revoke a cancellation that has a linked makeup.
    IF EXISTS(
      SELECT 1 FROM public.teaching_sessions
       WHERE teacher_id=v_teacher AND makeup_for_session_id=p_session_id
         AND makeup_for_student_id=p_student_id
    ) THEN
      RAISE EXCEPTION 'CANONICAL_ATTENDANCE_HAS_MAKEUP'
        USING ERRCODE='23514';
    END IF;
    DELETE FROM public.session_attendance
      WHERE teacher_id=v_teacher AND session_id=p_session_id
        AND student_id=p_student_id;
    v_receipt:=jsonb_build_object(
      'sessionId',p_session_id,'studentId',p_student_id,'cleared',true,
      'status',null,'revision',null,'idempotencyKey',p_idempotency_key);
  ELSE
    v_cancelled_by:=CASE WHEN p_status='student_cancelled' THEN 'student'
      WHEN p_status='teacher_cancelled' THEN 'teacher' ELSE NULL END;
    PERFORM set_config('ccp.attendance_commit_session',p_session_id::text,true);
    IF v_att.id IS NULL THEN
      INSERT INTO public.session_attendance(
        teacher_id,session_id,student_id,status,note,notice_at,
        cancelled_by,cancel_reason,marked_at,marked_by,updated_at
      ) VALUES(
        v_teacher,p_session_id,p_student_id,p_status,p_note,p_notice_at,
        v_cancelled_by,p_cancel_reason,clock_timestamp(),v_teacher,clock_timestamp()
      ) RETURNING * INTO v_att;
    ELSE
      UPDATE public.session_attendance SET
        status=p_status,note=p_note,notice_at=p_notice_at,
        cancelled_by=v_cancelled_by,cancel_reason=p_cancel_reason,
        marked_at=clock_timestamp(),marked_by=v_teacher,
        updated_at=clock_timestamp()
      WHERE id=v_att.id RETURNING * INTO v_att;
    END IF;
    v_receipt:=jsonb_build_object(
      'sessionId',p_session_id,'studentId',p_student_id,'cleared',false,
      'status',v_att.status,'note',v_att.note,'noticeAt',v_att.notice_at,
      'cancelReason',v_att.cancel_reason,'cancelledBy',v_att.cancelled_by,
      'markedAt',v_att.marked_at,'revision',v_att.updated_at,
      'idempotencyKey',p_idempotency_key);
  END IF;
  IF p_notify_family THEN
    INSERT INTO public.ccp_delivery_outbox(
      teacher_id,session_id,student_id,event_key,kind,payload
    ) VALUES(v_teacher,p_session_id,p_student_id,
      'session-cancel:'||p_idempotency_key::text,
      'session_cancel_family',
      jsonb_build_object('sessionId',p_session_id,
        'studentId',p_student_id,'markedAt',v_att.marked_at,
        'cancelReason',p_cancel_reason,'requestId',p_idempotency_key));
  END IF;
  UPDATE public.agent_tool_receipts SET receipt=v_receipt
    WHERE teacher_id=v_teacher AND idempotency_key=p_idempotency_key;
  RETURN v_receipt||jsonb_build_object('replayed',false);
END;
$ccp_attendance_mutate$;
REVOKE ALL ON FUNCTION public.ccp_canonical_attendance_mutate(
  uuid,uuid,text,text,timestamptz,text,timestamptz,uuid,boolean
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_canonical_attendance_mutate(
  uuid,uuid,text,text,timestamptz,text,timestamptz,uuid,boolean
) TO authenticated;

-- Authoritative attendance writes must not bypass the shared transaction.
-- SECURITY DEFINER RPCs above retain write privileges, but direct
-- authenticated PostgREST insert/update/delete do not.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.session_attendance FROM authenticated;


-- All-or-nothing canonical bulk attendance writer. The whole batch executes
-- in one Postgres RPC transaction. A stale student row rolls back every other
-- row and their receipts, rather than partially marking a class.
CREATE OR REPLACE FUNCTION public.ccp_canonical_attendance_bulk_mutate(
 p_session_id uuid,p_rows jsonb,p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $ccp_attendance_bulk$
DECLARE
 v_teacher uuid:=auth.uid();
 v_saved public.agent_tool_receipts%ROWTYPE;
 v_row jsonb;
 v_receipts jsonb:='[]'::jsonb;
 v_receipt jsonb;
 v_hash text;
 v_student uuid;
 v_child_key uuid;
 v_seen uuid[]:=ARRAY[]::uuid[];
BEGIN
 IF v_teacher IS NULL THEN
  RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
 END IF;
 IF p_session_id IS NULL OR p_idempotency_key IS NULL
   OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
   OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 50
   OR pg_column_size(p_rows)>400000 THEN
  RAISE EXCEPTION 'CANONICAL_ATTENDANCE_BULK_INVALID' USING ERRCODE='22023';
 END IF;
 v_hash:=md5(jsonb_build_array('canonical.attendance.bulk',
  p_session_id,p_rows)::text);
 INSERT INTO public.agent_tool_receipts(
  teacher_id,idempotency_key,operation,request_hash,receipt
 ) VALUES(v_teacher,p_idempotency_key,'canonical.attendance.bulk',
   v_hash,'{}'::jsonb) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN
   SELECT * INTO v_saved FROM public.agent_tool_receipts
    WHERE teacher_id=v_teacher AND idempotency_key=p_idempotency_key;
   IF NOT FOUND OR v_saved.operation<>'canonical.attendance.bulk'
       OR v_saved.request_hash<>v_hash THEN
     RAISE EXCEPTION 'CANONICAL_ATTENDANCE_BULK_REPLAY_CONFLICT'
       USING ERRCODE='23505';
   END IF;
   RETURN v_saved.receipt||jsonb_build_object('replayed',true);
 END IF;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF jsonb_typeof(v_row) IS DISTINCT FROM 'object'
     OR (v_row - ARRAY['studentId','status','note','noticeAt',
       'cancelReason','expectedUpdatedAt','notifyFamily'])<>'{}'::jsonb
     OR jsonb_typeof(v_row->'studentId')<>'string'
     OR jsonb_typeof(v_row->'expectedUpdatedAt') NOT IN ('string','null')
     OR jsonb_typeof(v_row->'notifyFamily')<>'boolean' THEN
    RAISE EXCEPTION 'CANONICAL_ATTENDANCE_BULK_INVALID'
      USING ERRCODE='22023';
  END IF;
  v_student:=(v_row->>'studentId')::uuid;
  IF v_student=ANY(v_seen) THEN
    RAISE EXCEPTION 'CANONICAL_ATTENDANCE_BULK_DUPLICATE_STUDENT'
      USING ERRCODE='22023';
  END IF;
  v_seen:=array_append(v_seen,v_student);
  v_child_key:=md5(p_idempotency_key::text || ':' || v_student::text)::uuid;
  SELECT public.ccp_canonical_attendance_mutate(
    p_session_id,v_student,v_row->>'status',coalesce(v_row->>'note',''),
    (v_row->>'noticeAt')::timestamptz,coalesce(v_row->>'cancelReason',''),
    (v_row->>'expectedUpdatedAt')::timestamptz,
    v_child_key,(v_row->>'notifyFamily')::boolean
  ) INTO v_receipt;
  v_receipts:=v_receipts||jsonb_build_array(v_receipt);
 END LOOP;
 v_receipt:=jsonb_build_object(
  'sessionId',p_session_id,'count',jsonb_array_length(v_receipts),
  'attendance',v_receipts,'idempotencyKey',p_idempotency_key
 );
 UPDATE public.agent_tool_receipts SET receipt=v_receipt
  WHERE teacher_id=v_teacher AND idempotency_key=p_idempotency_key;
 RETURN v_receipt||jsonb_build_object('replayed',false);
END;
$ccp_attendance_bulk$;
REVOKE ALL ON FUNCTION public.ccp_canonical_attendance_bulk_mutate(
 uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_canonical_attendance_bulk_mutate(
 uuid,jsonb,uuid) TO authenticated;


-- Canonical financial ownership: a group teaching event occurs once, but
-- each guardian invoice line and credit redemption belongs to exactly one
-- frozen participant. All mutations serialize on the session row, and a
-- non-void line and a prepaid redemption can never cover the same student.
CREATE OR REPLACE FUNCTION public.ccp_canonical_finance_line_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $ccp_invoice_line$
DECLARE
 v_invoice public.invoices%ROWTYPE;
 v_session public.teaching_sessions%ROWTYPE;
 v_guardian uuid;
 v_student_teacher uuid;
 v_date date;
BEGIN
 IF NEW.session_id IS NULL THEN
   IF NEW.student_id IS NOT NULL THEN
     RAISE EXCEPTION 'INVALID_CANONICAL_FINANCE_PAIR' USING ERRCODE='23514';
   END IF;
   RETURN NEW;
 END IF;
 IF NEW.student_id IS NULL OR NEW.kind NOT IN ('lesson','travel')
    OR NEW.lesson_id IS NOT NULL THEN
   RAISE EXCEPTION 'INVALID_CANONICAL_FINANCE_PAIR' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_invoice FROM public.invoices
    WHERE id=NEW.invoice_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND' USING ERRCODE='23503';END IF;
 SELECT * INTO v_session FROM public.teaching_sessions
    WHERE id=NEW.session_id AND teacher_id=v_invoice.teacher_id
    FOR NO KEY UPDATE;
 IF NOT FOUND OR NOT EXISTS(
   SELECT 1 FROM public.session_participants
    WHERE session_id=NEW.session_id AND student_id=NEW.student_id
      AND teacher_id=v_invoice.teacher_id
 ) THEN
   RAISE EXCEPTION 'FINANCE_PARTICIPANT_NOT_FOUND' USING ERRCODE='42501';
 END IF;
 SELECT guardian_id,teacher_id INTO v_guardian,v_student_teacher
  FROM public.students WHERE id=NEW.student_id;
 IF v_guardian IS DISTINCT FROM v_invoice.guardian_id
    OR v_student_teacher IS DISTINCT FROM v_invoice.teacher_id THEN
   RAISE EXCEPTION 'FINANCE_WRONG_GUARDIAN' USING ERRCODE='42501';
 END IF;
 v_date:=(v_session.starts_at AT TIME ZONE
  coalesce(nullif(v_session.local_timezone,''),'UTC'))::date;
 IF v_date NOT BETWEEN v_invoice.period_start AND v_invoice.period_end THEN
   RAISE EXCEPTION 'FINANCE_OUTSIDE_INVOICE_PERIOD' USING ERRCODE='22023';
 END IF;
 IF EXISTS(
  SELECT 1 FROM public.invoice_items ii
   JOIN public.invoices i ON i.id=ii.invoice_id
   WHERE ii.session_id=NEW.session_id AND ii.student_id=NEW.student_id
     AND ii.kind=NEW.kind AND ii.id<>NEW.id
     AND i.teacher_id=v_invoice.teacher_id AND i.status<>'void'
 ) THEN
  RAISE EXCEPTION 'INVOICE_ALREADY_COMMITTED' USING ERRCODE='23505';
 END IF;
 IF NEW.kind='lesson' AND EXISTS(
   SELECT 1 FROM public.credit_redemptions r
    WHERE r.session_id=NEW.session_id AND r.student_id=NEW.student_id
 ) THEN
   RAISE EXCEPTION 'CANONICAL_LESSON_ALREADY_REDEEMED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$ccp_invoice_line$;
REVOKE ALL ON FUNCTION public.ccp_canonical_finance_line_guard() FROM PUBLIC,anon;
CREATE TRIGGER ccp_canonical_finance_line_guard
 BEFORE INSERT OR UPDATE ON public.invoice_items
 FOR EACH ROW EXECUTE FUNCTION public.ccp_canonical_finance_line_guard();

CREATE OR REPLACE FUNCTION public.ccp_canonical_redemption_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $ccp_credit_guard$
DECLARE
 v_package public.credit_packages%ROWTYPE;
 v_session public.teaching_sessions%ROWTYPE;
 v_status text;
 v_used integer;
 v_date date;
BEGIN
 IF NEW.session_id IS NULL THEN
   IF NEW.student_id IS NOT NULL THEN
     RAISE EXCEPTION 'INVALID_CANONICAL_CREDIT_PAIR' USING ERRCODE='23514';
   END IF;
   RETURN NEW;
 END IF;
 IF NEW.student_id IS NULL OR NEW.lesson_id IS NOT NULL THEN
   RAISE EXCEPTION 'INVALID_CANONICAL_CREDIT_PAIR' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_package FROM public.credit_packages
   WHERE id=NEW.package_id FOR UPDATE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'CREDIT_PACKAGE_NOT_FOUND' USING ERRCODE='23503';
 END IF;
 SELECT * INTO v_session FROM public.teaching_sessions
   WHERE id=NEW.session_id AND teacher_id=NEW.teacher_id FOR NO KEY UPDATE;
 IF NOT FOUND OR v_package.teacher_id<>NEW.teacher_id
   OR v_package.student_id<>NEW.student_id
   OR NOT EXISTS(
     SELECT 1 FROM public.session_participants
      WHERE session_id=NEW.session_id AND student_id=NEW.student_id
        AND teacher_id=NEW.teacher_id
   ) THEN
   RAISE EXCEPTION 'CREDIT_PARTICIPANT_NOT_OWNED' USING ERRCODE='42501';
 END IF;
 IF v_package.duration_minutes<>v_session.duration_minutes THEN
   RAISE EXCEPTION 'CREDIT_WRONG_DURATION' USING ERRCODE='23514';
 END IF;
 v_date:=(v_session.starts_at AT TIME ZONE
    coalesce(nullif(v_session.local_timezone,''),'UTC'))::date;
 IF v_date<v_package.starts_on OR
   (v_package.expires_on IS NOT NULL AND v_date>v_package.expires_on) THEN
   RAISE EXCEPTION 'CREDIT_OUTSIDE_PACKAGE_DATES' USING ERRCODE='23514';
 END IF;
 SELECT status INTO v_status FROM public.invoices
   WHERE id=v_package.invoice_id;
 IF v_status NOT IN ('sent','paid') THEN
   RAISE EXCEPTION 'CREDIT_INVOICE_NOT_ACTIVE' USING ERRCODE='23514';
 END IF;
 SELECT count(*) INTO v_used FROM public.credit_redemptions
   WHERE package_id=v_package.id AND id<>NEW.id;
 IF v_used>=v_package.credits THEN
   RAISE EXCEPTION 'CREDIT_PACKAGE_EXHAUSTED' USING ERRCODE='23514';
 END IF;
 IF EXISTS(
  SELECT 1 FROM public.invoice_items ii
   JOIN public.invoices i ON i.id=ii.invoice_id
   WHERE ii.session_id=NEW.session_id AND ii.student_id=NEW.student_id
    AND ii.kind='lesson' AND i.status<>'void'
 ) THEN
   RAISE EXCEPTION 'CANONICAL_LESSON_ALREADY_INVOICED'
      USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$ccp_credit_guard$;
REVOKE ALL ON FUNCTION public.ccp_canonical_redemption_guard() FROM PUBLIC,anon;
CREATE TRIGGER ccp_canonical_redemption_guard
 BEFORE INSERT OR UPDATE ON public.credit_redemptions
 FOR EACH ROW EXECUTE FUNCTION public.ccp_canonical_redemption_guard();


-- Once a non-void invoice line or redeemed prepaid package references one
-- frozen participant, neither attendance nor the underlying teaching time
-- may be silently rewritten by the calendar, MCP, or a direct REST request.
CREATE OR REPLACE FUNCTION public.ccp_protect_canonical_financed_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $ccp_financed_session_guard$
DECLARE v_id uuid:=OLD.id;
BEGIN
 IF EXISTS(
  SELECT 1 FROM public.invoice_items ii
  JOIN public.invoices i ON i.id=ii.invoice_id
  WHERE ii.session_id=v_id AND i.status<>'void'
 ) OR EXISTS(
  SELECT 1 FROM public.credit_redemptions WHERE session_id=v_id
 ) THEN
  IF TG_OP='DELETE' THEN
   RAISE EXCEPTION 'CANONICAL_FINANCED_SESSION_IMMUTABLE'
    USING ERRCODE='23514';
  END IF;
  IF (NEW.starts_at,NEW.duration_minutes,NEW.student_id,NEW.group_id,
      NEW.workplace_id,NEW.is_home_visit,NEW.local_timezone,
      NEW.slot_rate_cents,NEW.makeup_for_session_id,NEW.makeup_for_student_id)
     IS DISTINCT FROM
     (OLD.starts_at,OLD.duration_minutes,OLD.student_id,OLD.group_id,
      OLD.workplace_id,OLD.is_home_visit,OLD.local_timezone,
      OLD.slot_rate_cents,OLD.makeup_for_session_id,OLD.makeup_for_student_id) THEN
    RAISE EXCEPTION 'CANONICAL_FINANCED_SESSION_IMMUTABLE'
      USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$ccp_financed_session_guard$;
REVOKE ALL ON FUNCTION public.ccp_protect_canonical_financed_session()
 FROM PUBLIC,anon;
CREATE TRIGGER ccp_protect_canonical_financed_session
 BEFORE UPDATE OR DELETE ON public.teaching_sessions
 FOR EACH ROW EXECUTE FUNCTION public.ccp_protect_canonical_financed_session();

CREATE OR REPLACE FUNCTION public.ccp_protect_canonical_financed_attendance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $ccp_financed_attendance_guard$
DECLARE v_session uuid:=OLD.session_id;v_student uuid:=OLD.student_id;
BEGIN
 IF EXISTS(
   SELECT 1 FROM public.invoice_items ii
   JOIN public.invoices i ON i.id=ii.invoice_id
   WHERE ii.session_id=v_session AND ii.student_id=v_student
     AND i.status<>'void'
 ) OR EXISTS(
   SELECT 1 FROM public.credit_redemptions
    WHERE session_id=v_session AND student_id=v_student
 ) THEN
   IF TG_OP='DELETE' THEN
     RAISE EXCEPTION 'CANONICAL_FINANCED_ATTENDANCE_IMMUTABLE'
       USING ERRCODE='23514';
   END IF;
   IF (NEW.status,NEW.notice_at,NEW.cancelled_by,NEW.cancel_reason)
      IS DISTINCT FROM
      (OLD.status,OLD.notice_at,OLD.cancelled_by,OLD.cancel_reason) THEN
     RAISE EXCEPTION 'CANONICAL_FINANCED_ATTENDANCE_IMMUTABLE'
       USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$ccp_financed_attendance_guard$;
REVOKE ALL ON FUNCTION public.ccp_protect_canonical_financed_attendance()
 FROM PUBLIC,anon;
CREATE TRIGGER ccp_protect_canonical_financed_attendance
 BEFORE UPDATE OR DELETE ON public.session_attendance
 FOR EACH ROW EXECUTE FUNCTION public.ccp_protect_canonical_financed_attendance();


-- Financial cutover: the only new allocation identity is the pair
-- (session_id, student_id). An instructor's group session is not copied for
-- each pupil; a separate invoice line per participant carries the charge.
-- The receipt hash intentionally preserves the existing website/MCP billing
-- operation identity, so a replay is transport independent.
CREATE OR REPLACE FUNCTION public.ccp_canonical_invoice_generation_commit(
 p_period_start date,p_period_end date,p_drafts jsonb,
 p_redemptions jsonb,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $ccp_canonical_invoice_generate$
DECLARE
 v_teacher uuid:=auth.uid();v_currency text;
 v_draft jsonb;v_line jsonb;v_credit jsonb;
 v_invoice uuid;v_session uuid;v_student uuid;v_guardian uuid;
 v_package uuid;v_kind text;v_description text;
 v_quantity integer;v_unit integer;v_amount integer;
 v_subtotal bigint;v_sort integer;
 v_created jsonb:='[]'::jsonb;v_count integer:=0;v_credits integer:=0;
 v_hash text;v_prior public.agent_tool_receipts%ROWTYPE;v_receipt jsonb;
BEGIN
 IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_period_start IS NULL OR p_period_end IS NULL
    OR p_period_end<p_period_start OR p_period_end-p_period_start>367
    OR jsonb_typeof(p_drafts) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_redemptions) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_drafts)>200
    OR jsonb_array_length(p_redemptions)>2000
    OR pg_column_size(p_drafts)>2000000 OR pg_column_size(p_redemptions)>150000
 THEN
   RAISE EXCEPTION 'INVALID_BILLING_BATCH' USING ERRCODE='22023';
 END IF;
 PERFORM 1 FROM public.teachers WHERE id=v_teacher FOR UPDATE;
 v_hash:=md5(jsonb_build_array('billing.generation.commit',
     p_period_start,p_period_end)::text);
 INSERT INTO public.agent_tool_receipts(
  teacher_id,idempotency_key,operation,request_hash,receipt
 ) VALUES(v_teacher,p_request_id,'billing.generation.commit',v_hash,'{}'::jsonb)
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN
   SELECT * INTO v_prior FROM public.agent_tool_receipts
     WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
   IF NOT FOUND OR v_prior.operation<>'billing.generation.commit'
      OR v_prior.request_hash<>v_hash THEN
     RAISE EXCEPTION 'BILLING_GENERATION_REQUEST_CONFLICT' USING ERRCODE='23505';
   END IF;
   RETURN v_prior.receipt||jsonb_build_object('replayed',true);
 END IF;
 SELECT currency INTO v_currency FROM public.studio_policies
  WHERE teacher_id=v_teacher;
 IF v_currency IS NULL THEN RAISE EXCEPTION 'STUDIO_POLICY_NOT_FOUND' USING ERRCODE='42501'; END IF;
 FOR v_credit IN SELECT value FROM jsonb_array_elements(p_redemptions) LOOP
   v_session:=(v_credit->>'sessionId')::uuid;
   v_student:=(v_credit->>'studentId')::uuid;
   v_package:=(v_credit->>'packageId')::uuid;
   IF v_session IS NULL OR v_student IS NULL OR v_package IS NULL THEN
    RAISE EXCEPTION 'INVALID_CREDIT_ALLOCATION' USING ERRCODE='22023';
   END IF;
   INSERT INTO public.credit_redemptions(
    teacher_id,session_id,student_id,package_id
   ) VALUES(v_teacher,v_session,v_student,v_package);
   v_credits:=v_credits+1;
 END LOOP;
 FOR v_draft IN SELECT value FROM jsonb_array_elements(p_drafts) LOOP
   v_guardian:=(v_draft->>'guardianId')::uuid;
   IF v_guardian IS NULL OR NOT EXISTS(
     SELECT 1 FROM public.guardians WHERE id=v_guardian AND teacher_id=v_teacher
   ) OR jsonb_typeof(v_draft->'items') IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_draft->'items') NOT BETWEEN 1 AND 2000
   THEN RAISE EXCEPTION 'INVALID_BILLING_FAMILY' USING ERRCODE='22023'; END IF;
   INSERT INTO public.invoices(
    teacher_id,guardian_id,period_start,period_end,status,
    subtotal_cents,currency
   ) VALUES(v_teacher,v_guardian,p_period_start,p_period_end,'draft',0,v_currency)
   RETURNING id INTO v_invoice;
   v_subtotal:=0;v_sort:=0;
   FOR v_line IN SELECT value FROM jsonb_array_elements(v_draft->'items') LOOP
     v_session:=(v_line->>'sessionId')::uuid;
     v_student:=(v_line->>'studentId')::uuid;
     v_kind:=v_line->>'kind';
     v_description:=nullif(btrim(v_line->>'description'),'');
     v_quantity:=(v_line->>'quantity')::integer;
     v_unit:=(v_line->>'unitCents')::integer;
     v_amount:=(v_line->>'amountCents')::integer;
     IF v_session IS NULL OR v_student IS NULL
       OR v_kind NOT IN ('lesson','travel') OR
       v_description IS NULL OR length(v_description)>500 OR
       v_quantity NOT BETWEEN 1 AND 10000 OR
       v_unit NOT BETWEEN 0 AND 100000000 OR
       v_amount NOT BETWEEN 0 AND 100000000 OR
       v_quantity::bigint*v_unit<>v_amount THEN
       RAISE EXCEPTION 'INVALID_BILLING_LINE' USING ERRCODE='22023';
     END IF;
     INSERT INTO public.invoice_items(
       invoice_id,session_id,student_id,kind,description,
       quantity,unit_cents,amount_cents,sort_order
     ) VALUES(v_invoice,v_session,v_student,v_kind,v_description,
       v_quantity,v_unit,v_amount,v_sort);
     v_subtotal:=v_subtotal+v_amount;
     v_sort:=v_sort+1;
   END LOOP;
   IF v_subtotal>2147483647 THEN
      RAISE EXCEPTION 'INVOICE_SUBTOTAL_OVERFLOW' USING ERRCODE='22003';
   END IF;
   UPDATE public.invoices SET subtotal_cents=v_subtotal::integer
      WHERE id=v_invoice;
   v_created:=v_created||jsonb_build_array(v_invoice);
   v_count:=v_count+1;
 END LOOP;
 v_receipt:=jsonb_build_object('created',v_created,'count',v_count,
  'creditsUsed',v_credits,'periodStart',p_period_start,'periodEnd',p_period_end,
  'idempotencyKey',p_request_id,'replayed',false);
 UPDATE public.agent_tool_receipts SET receipt=v_receipt
   WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
 RETURN v_receipt;
END;
$ccp_canonical_invoice_generate$;
REVOKE ALL ON FUNCTION public.ccp_canonical_invoice_generation_commit(
 date,date,jsonb,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_canonical_invoice_generation_commit(
 date,date,jsonb,jsonb,uuid) TO authenticated;

-- Draft regeneration never mutates a paid/sent invoice or an invoice with a
-- live checkout, payment, or prepaid package sale. The replacement is one
-- transaction, with its original revision and receipt.
CREATE OR REPLACE FUNCTION public.ccp_canonical_invoice_regenerate_atomic(
 p_invoice_id uuid,p_items jsonb,p_redemptions jsonb,
 p_expected_updated_at timestamptz,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $ccp_canonical_invoice_regenerate$
DECLARE
 v_teacher uuid:=auth.uid();
 v_invoice public.invoices%ROWTYPE;
 v_credit jsonb;v_line jsonb;v_session uuid;v_student uuid;v_package uuid;
 v_kind text;v_description text;v_quantity integer;v_unit integer;v_amount integer;
 v_subtotal bigint:=0;v_sort integer:=0;v_hash text;
 v_prior public.agent_tool_receipts%ROWTYPE;v_receipt jsonb;v_updated timestamptz;
BEGIN
 IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';END IF;
 IF p_invoice_id IS NULL OR p_request_id IS NULL OR p_expected_updated_at IS NULL OR
   jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR
   jsonb_typeof(p_redemptions) IS DISTINCT FROM 'array' OR
   jsonb_array_length(p_items)>2000 OR jsonb_array_length(p_redemptions)>2000
 THEN RAISE EXCEPTION 'INVALID_REGENERATION_INPUT' USING ERRCODE='22023';END IF;
 PERFORM 1 FROM public.teachers WHERE id=v_teacher FOR UPDATE;
 v_hash:=md5(jsonb_build_array('billing.invoice.regenerate',
    p_invoice_id,p_expected_updated_at)::text);
 INSERT INTO public.agent_tool_receipts(
  teacher_id,idempotency_key,operation,request_hash,receipt
 ) VALUES(v_teacher,p_request_id,'billing.invoice.regenerate',v_hash,'{}'::jsonb)
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN
   SELECT * INTO v_prior FROM public.agent_tool_receipts
    WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
   IF NOT FOUND OR v_prior.operation<>'billing.invoice.regenerate'
      OR v_prior.request_hash<>v_hash THEN
     RAISE EXCEPTION 'INVOICE_REGENERATION_REQUEST_CONFLICT' USING ERRCODE='23505';
   END IF;
   RETURN v_prior.receipt||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO v_invoice FROM public.invoices
   WHERE id=p_invoice_id AND teacher_id=v_teacher FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';END IF;
 IF v_invoice.updated_at IS DISTINCT FROM p_expected_updated_at THEN
   RAISE EXCEPTION 'STALE_INVOICE_REVISION' USING ERRCODE='23505';
 END IF;
 IF v_invoice.status<>'draft'
   OR EXISTS(SELECT 1 FROM public.credit_packages WHERE invoice_id=p_invoice_id)
   OR EXISTS(SELECT 1 FROM public.payments WHERE invoice_id=p_invoice_id)
   OR v_invoice.stripe_checkout_session_id IS NOT NULL
   OR v_invoice.stripe_checkout_url IS NOT NULL
   OR v_invoice.stripe_payment_intent_id IS NOT NULL THEN
   RAISE EXCEPTION 'INVOICE_REGENERATION_BLOCKED' USING ERRCODE='23514';
 END IF;
 DELETE FROM public.invoice_items WHERE invoice_id=p_invoice_id;
 FOR v_credit IN SELECT value FROM jsonb_array_elements(p_redemptions) LOOP
   v_session:=(v_credit->>'sessionId')::uuid;
   v_student:=(v_credit->>'studentId')::uuid;
   v_package:=(v_credit->>'packageId')::uuid;
   IF v_session IS NULL OR v_student IS NULL OR v_package IS NULL THEN
    RAISE EXCEPTION 'INVALID_CREDIT_ALLOCATION' USING ERRCODE='22023';END IF;
   INSERT INTO public.credit_redemptions(
    teacher_id,session_id,student_id,package_id
   ) VALUES(v_teacher,v_session,v_student,v_package);
 END LOOP;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   v_session:=(v_line->>'sessionId')::uuid;
   v_student:=(v_line->>'studentId')::uuid;
   v_kind:=v_line->>'kind';
   v_description:=nullif(btrim(v_line->>'description'),'');
   v_quantity:=(v_line->>'quantity')::integer;
   v_unit:=(v_line->>'unitCents')::integer;
   v_amount:=(v_line->>'amountCents')::integer;
   IF v_session IS NULL OR v_student IS NULL
    OR v_kind NOT IN ('lesson','travel')
    OR v_description IS NULL OR length(v_description)>500
    OR v_quantity NOT BETWEEN 1 AND 10000
    OR v_unit NOT BETWEEN 0 AND 100000000
    OR v_amount NOT BETWEEN 0 AND 100000000
    OR v_quantity::bigint*v_unit<>v_amount THEN
    RAISE EXCEPTION 'INVALID_REGENERATION_LINE' USING ERRCODE='22023';
   END IF;
   INSERT INTO public.invoice_items(
     invoice_id,session_id,student_id,kind,description,
     quantity,unit_cents,amount_cents,sort_order
   ) VALUES(p_invoice_id,v_session,v_student,v_kind,v_description,
      v_quantity,v_unit,v_amount,v_sort);
   v_subtotal:=v_subtotal+v_amount;v_sort:=v_sort+1;
 END LOOP;
 IF v_subtotal>2147483647 THEN
   RAISE EXCEPTION 'INVOICE_SUBTOTAL_OVERFLOW' USING ERRCODE='22003';
 END IF;
 UPDATE public.invoices SET subtotal_cents=v_subtotal::integer
   WHERE id=p_invoice_id RETURNING updated_at INTO v_updated;
 v_receipt:=jsonb_build_object('ok',true,'invoiceId',p_invoice_id,
  'itemCount',v_sort,'subtotalCents',v_subtotal::integer,
  'updatedAt',v_updated,'idempotencyKey',p_request_id,'replayed',false);
 UPDATE public.agent_tool_receipts SET receipt=v_receipt
   WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
 RETURN v_receipt;
END;
$ccp_canonical_invoice_regenerate$;
REVOKE ALL ON FUNCTION public.ccp_canonical_invoice_regenerate_atomic(
 uuid,jsonb,jsonb,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_canonical_invoice_regenerate_atomic(
 uuid,jsonb,jsonb,timestamptz,uuid) TO authenticated;
