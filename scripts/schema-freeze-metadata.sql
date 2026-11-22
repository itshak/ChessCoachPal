-- Schema-freeze structural snapshot (metadata ONLY).
-- Execute manually on an explicitly authorized source/target with a READ ONLY
-- transaction. Do not execute against a populated database without approval.
-- Run in psql: BEGIN READ ONLY; \i scripts/schema-freeze-metadata.sql; ROLLBACK;
-- The single JSON result is input to scripts/compare-schema-freeze.mjs.
-- No user rows, secrets, token values, or table contents are selected.
WITH
t AS (
 SELECT n.nspname AS schema,c.relname AS name,
        c.relkind::text AS kind,c.relpersistence::text AS persistence,
        c.relrowsecurity AS rls_enabled,c.relforcerowsecurity AS rls_forced,
        pg_get_userbyid(c.relowner) AS owner
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
),
cols AS (
 SELECT n.nspname AS schema,c.relname AS "table",a.attname AS name,
        a.attnum AS ordinal,format_type(a.atttypid,a.atttypmod) AS data_type,
        a.attnotnull AS not_null,
        pg_get_expr(d.adbin,d.adrelid) AS default_expression,
        a.attidentity::text AS identity_kind,a.attgenerated::text AS generated_kind,
        col.collname AS collation
 FROM pg_attribute a
 JOIN pg_class c ON c.oid=a.attrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 LEFT JOIN pg_collation col ON col.oid=a.attcollation AND a.attcollation<>0
 WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
 AND a.attnum>0 AND NOT a.attisdropped
),
cons AS (
 SELECT n.nspname AS schema,c.relname AS "table",k.conname AS name,
        k.contype::text AS kind,pg_get_constraintdef(k.oid,true) AS definition,
        k.condeferrable AS deferrable,k.condeferred AS initially_deferred,
        k.convalidated AS validated
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
),
idx AS (
 SELECT schemaname AS schema,tablename AS "table",indexname AS name,
        indexdef AS definition FROM pg_indexes WHERE schemaname='public'
),
trg AS (
 SELECT n.nspname AS schema,c.relname AS "table",g.tgname AS name,
        pg_get_triggerdef(g.oid,true) AS definition,g.tgenabled::text AS enabled
 FROM pg_trigger g JOIN pg_class c ON c.oid=g.tgrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND NOT g.tgisinternal
),
pol AS (
 SELECT schemaname AS schema,tablename AS "table",policyname AS name,
        permissive,roles,cmd,qual,with_check
 FROM pg_policies WHERE schemaname='public'
),
fn AS (
 SELECT n.nspname AS schema,
        p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS identity,
        pg_get_functiondef(p.oid) AS definition,
        p.prosecdef AS security_definer,p.provolatile::text AS volatility,
        p.proparallel::text AS parallel,
        p.proconfig AS configuration
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
),
gr AS (
 -- pg_catalog ACLs include PUBLIC and non-current-role grants that
 -- information_schema may omit. Stable routine identity excludes OIDs.
 SELECT n.nspname AS schema,'relation' AS object_kind,
        c.relname AS object_identity,
        CASE WHEN acl.grantee=0 THEN 'PUBLIC'
             ELSE pg_get_userbyid(acl.grantee) END AS grantee,
        acl.privilege_type AS privilege,
        acl.is_grantable AS grantable
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN LATERAL aclexplode(
  COALESCE(c.relacl,acldefault('r',c.relowner))) acl
 WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
 UNION ALL
 SELECT n.nspname AS schema,'routine' AS object_kind,
        p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
          AS object_identity,
        CASE WHEN acl.grantee=0 THEN 'PUBLIC'
             ELSE pg_get_userbyid(acl.grantee) END AS grantee,
        acl.privilege_type AS privilege,
        acl.is_grantable AS grantable
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 CROSS JOIN LATERAL aclexplode(
  COALESCE(p.proacl,acldefault('f',p.proowner))) acl
 WHERE n.nspname='public'
)

SELECT jsonb_pretty(jsonb_build_object(
 'tables',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema,name) FROM t x),'[]'::jsonb),
 'columns',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema,"table",ordinal) FROM cols x),'[]'::jsonb),
 'constraints',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema,"table",name) FROM cons x),'[]'::jsonb),
 'indexes',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema,"table",name) FROM idx x),'[]'::jsonb),
 'triggers',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema,"table",name) FROM trg x),'[]'::jsonb),
 'policies',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema,"table",name) FROM pol x),'[]'::jsonb),
 'functions',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema,identity) FROM fn x),'[]'::jsonb),
 'grants',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema,object_kind,object_identity,grantee,privilege) FROM gr x),'[]'::jsonb)
)) AS snapshot;
