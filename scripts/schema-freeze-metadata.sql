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
        pg_get_userbyid(c.relowner) AS owner,
        CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) END AS view_definition
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
        pg_get_userbyid(p.proowner) AS owner,
        p.prosecdef AS security_definer,p.provolatile::text AS volatility,
        p.proparallel::text AS parallel,
        p.proconfig AS configuration
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
),
seq AS (
 SELECT n.nspname AS schema,c.relname AS name,
        pg_get_userbyid(c.relowner) AS owner,
        s.seqtypid::regtype::text AS data_type,
        s.seqstart AS start_value,s.seqincrement AS increment_by,
        s.seqmin AS min_value,s.seqmax AS max_value,
        s.seqcache AS cache_size,s.seqcycle AS cycle
 FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public'
),
typ AS (
 SELECT n.nspname AS schema,t.typname AS name,
        t.typtype::text AS kind,
        format_type(t.typbasetype,t.typtypmod) AS base_type,
        t.typnotnull AS not_null,
        t.typdefault AS default_value,
        (SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
         FROM pg_enum e WHERE e.enumtypid=t.oid) AS enum_values,
        (SELECT jsonb_agg(pg_get_constraintdef(k.oid,true) ORDER BY k.conname)
         FROM pg_constraint k WHERE k.contypid=t.oid) AS checks
 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
 WHERE n.nspname='public' AND t.typtype IN ('e','d')
),
ext AS (
 SELECT e.extname AS name,e.extversion AS version,
        n.nspname AS schema
 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
),
gr AS (
 -- pg_catalog ACLs include PUBLIC and non-current-role grants that
 -- information_schema may omit. Stable routine identity excludes OIDs.
 -- Use text for the UNION identity: PostgreSQL name truncates to 63 bytes.
 SELECT n.nspname AS schema,'relation' AS object_kind,
        c.relname::text AS object_identity,
        pg_get_userbyid(acl.grantor) AS grantor,
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
        pg_get_userbyid(acl.grantor) AS grantor,
        CASE WHEN acl.grantee=0 THEN 'PUBLIC'
             ELSE pg_get_userbyid(acl.grantee) END AS grantee,
        acl.privilege_type AS privilege,
        acl.is_grantable AS grantable
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 CROSS JOIN LATERAL aclexplode(
  COALESCE(p.proacl,acldefault('f',p.proowner))) acl
 WHERE n.nspname='public'
 UNION ALL
 SELECT n.nspname,'sequence',c.relname,pg_get_userbyid(acl.grantor),
        CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END,
        acl.privilege_type,acl.is_grantable
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('s',c.relowner))) acl
 WHERE n.nspname='public' AND c.relkind='S'
 UNION ALL
 SELECT n.nspname,'column',jsonb_build_array(c.relname,a.attname)::text,
        pg_get_userbyid(acl.grantor),
        CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END,
        acl.privilege_type,acl.is_grantable
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 CROSS JOIN LATERAL aclexplode(a.attacl) acl
 WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
 UNION ALL
 SELECT n.nspname,'schema',n.nspname,pg_get_userbyid(acl.grantor),
        CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END,
        acl.privilege_type,acl.is_grantable
 FROM pg_namespace n
 CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) acl
 WHERE n.nspname='public'
 UNION ALL
 SELECT COALESCE(n.nspname,'(global)'),'default_acl',
        jsonb_build_array(pg_get_userbyid(d.defaclrole),d.defaclobjtype::text)::text,
        pg_get_userbyid(acl.grantor),
        CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END,
        acl.privilege_type,acl.is_grantable
 FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
 CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
 WHERE n.nspname='public' OR d.defaclnamespace=0
)

SELECT jsonb_pretty(jsonb_build_object(
 'format',3,
 'tables',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema,name) FROM t x),'[]'::jsonb),
 'columns',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema,"table",ordinal) FROM cols x),'[]'::jsonb),
 'constraints',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema,"table",name) FROM cons x),'[]'::jsonb),
 'indexes',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema,"table",name) FROM idx x),'[]'::jsonb),
 'triggers',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema,"table",name) FROM trg x),'[]'::jsonb),
 'policies',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema,"table",name) FROM pol x),'[]'::jsonb),
 'functions',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema,identity) FROM fn x),'[]'::jsonb),
 'grants',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema,object_kind,object_identity,grantor,grantee,privilege) FROM gr x),'[]'::jsonb),
 'sequences',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema,name) FROM seq x),'[]'::jsonb),
 'types',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema,name) FROM typ x),'[]'::jsonb),
 'extensions',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY name) FROM ext x),'[]'::jsonb)
)) AS snapshot;
