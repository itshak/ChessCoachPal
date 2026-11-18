-- Complete app-owned public structural signature: tables, column grants,
-- constraints, indexes, triggers, functions, policies and RLS. No row data.
-- PostgreSQL catalog OIDs and migration ledger timestamps are deliberately excluded.
WITH footprint AS (
 SELECT jsonb_build_object(
   'relations',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relrowsecurity,
      c.relforcerowsecurity,coalesce(c.relacl::text,''))
      ORDER BY c.relname)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')),
   'columns',(SELECT jsonb_agg(jsonb_build_array(c.relname,a.attname,
      format_type(a.atttypid,a.atttypmod),a.attnotnull,
      coalesce(pg_get_expr(d.adbin,d.adrelid),''),coalesce(a.attacl::text,''))
      ORDER BY c.relname,a.attnum)
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped),
   'constraints',(SELECT jsonb_agg(jsonb_build_array(c.conname,
      c.conrelid::regclass::text,pg_get_constraintdef(c.oid,true))
      ORDER BY c.conrelid::regclass::text,c.conname)
      FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
      WHERE n.nspname='public'),
   'indexes',(SELECT jsonb_agg(jsonb_build_array(i.indexrelid::regclass::text,
      md5(pg_get_indexdef(i.indexrelid)))
      ORDER BY i.indexrelid::regclass::text)
      FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public'),
   'triggers',(SELECT jsonb_agg(jsonb_build_array(t.tgname,
      t.tgrelid::regclass::text,md5(pg_get_triggerdef(t.oid,true)))
      ORDER BY t.tgrelid::regclass::text,t.tgname)
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal),
   'routines',(SELECT jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,p.prokind,
      p.prosecdef,coalesce(p.proacl::text,''),md5(pg_get_functiondef(p.oid)))
      ORDER BY p.oid::regprocedure::text)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prokind IN ('f','p')),
   'policies',(SELECT jsonb_agg(jsonb_build_array(s.schemaname,s.tablename,
      s.policyname,s.permissive,s.roles,s.cmd,s.qual,s.with_check)
      ORDER BY s.tablename,s.policyname)
      FROM pg_policies s WHERE s.schemaname='public'),
   'storage_policies',(SELECT jsonb_agg(jsonb_build_array(s.tablename,s.policyname,
      s.roles,s.cmd,s.qual,s.with_check)
      ORDER BY s.tablename,s.policyname)
      FROM pg_policies s WHERE s.schemaname='storage')
 ) AS object_state
)
SELECT jsonb_pretty(object_state) FROM footprint;
