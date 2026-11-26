DO $$
BEGIN
 IF current_setting('ccp.rating_synthetic',true) IS DISTINCT FROM 'disposable'
 OR has_table_privilege('authenticated','public.online_rating_provider_budget','SELECT')
 OR has_table_privilege('anon','public.online_rating_provider_budget','SELECT')
 OR has_function_privilege('anon','public.ccp_online_rating_budget_acquire(text)','EXECUTE')
 OR has_function_privilege('authenticated','public.ccp_online_rating_budget_finish(text,uuid,text,timestamptz)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.ccp_online_rating_budget_acquire(text)','EXECUTE')
 OR has_column_privilege('service_role','public.online_rating_provider_budget','enabled','UPDATE')
 OR has_column_privilege('service_role','public.online_rating_provider_budget','daily_limit','UPDATE')
 OR has_column_privilege('service_role','public.online_rating_provider_budget','monthly_limit','UPDATE')
 THEN RAISE EXCEPTION 'role restriction mismatch'; END IF;
END $$;

UPDATE public.rating_providers SET active=false WHERE code='chesscom';
SET ROLE service_role;
DO $$
BEGIN
 IF public.ccp_online_rating_budget_acquire('chesscom')->>'status' IS DISTINCT FROM 'unavailable'
 THEN RAISE EXCEPTION 'inactive registry entry admitted'; END IF;
END $$;
RESET ROLE;
UPDATE public.rating_providers SET active=true WHERE code='chesscom';
SET ROLE service_role;
DO $$
BEGIN
 IF public.ccp_online_rating_budget_acquire('lichess')->>'status' IS DISTINCT FROM 'paused' THEN
 RAISE EXCEPTION 'default budget must be paused'; END IF;
END $$;
RESET ROLE;
UPDATE public.online_rating_provider_budget SET enabled=true,daily_limit=2,monthly_limit=2;
SET ROLE service_role;
DO $$
DECLARE grant1 jsonb; grant2 jsonb; t uuid; state text; hold_at timestamptz;
BEGIN
 IF public.ccp_online_rating_budget_acquire('unknown')->>'status' IS DISTINCT FROM 'unavailable'
 THEN RAISE EXCEPTION 'default or provider restriction'; END IF;
 grant1:=public.ccp_online_rating_budget_acquire('lichess');
 IF grant1->>'status' IS DISTINCT FROM 'admitted' THEN RAISE EXCEPTION 'first admission'; END IF;
 t:=(grant1->>'token')::uuid;
 IF public.ccp_online_rating_budget_acquire('lichess')->>'status' IS DISTINCT FROM 'in_flight'
  OR public.ccp_online_rating_budget_finish('lichess',gen_random_uuid(),'completed',NULL)->>'status' IS DISTINCT FROM 'stale'
 THEN RAISE EXCEPTION 'token/serial restriction'; END IF;
 grant2:=public.ccp_online_rating_budget_acquire('chesscom');
 IF grant2->>'status' IS DISTINCT FROM 'admitted' THEN RAISE EXCEPTION 'provider independence'; END IF;
 hold_at:=clock_timestamp()+interval '90 seconds';
 IF public.ccp_online_rating_budget_finish('lichess',t,'rate_limited',hold_at)->>'status' IS DISTINCT FROM 'recorded'
  OR public.ccp_online_rating_budget_acquire('lichess')->>'status' IS DISTINCT FROM 'cooling_down'
  OR NOT (SELECT blocked_until>=hold_at FROM public.online_rating_provider_budget WHERE provider='lichess')
 THEN RAISE EXCEPTION 'durable cooldown'; END IF;
 IF public.ccp_online_rating_budget_finish('chesscom',(grant2->>'token')::uuid,'completed',NULL)->>'status' IS DISTINCT FROM 'recorded'
 THEN RAISE EXCEPTION 'normal finish'; END IF;
 UPDATE public.online_rating_provider_budget SET blocked_until=NULL WHERE provider='lichess';
 grant1:=public.ccp_online_rating_budget_acquire('lichess');
 IF grant1->>'status' IS DISTINCT FROM 'admitted'
  OR public.ccp_online_rating_budget_finish('lichess',(grant1->>'token')::uuid,'completed',NULL)->>'status' IS DISTINCT FROM 'recorded'
  OR public.ccp_online_rating_budget_acquire('lichess')->>'status' IS DISTINCT FROM 'quota'
 THEN RAISE EXCEPTION 'budget exhaustion'; END IF;
 UPDATE public.online_rating_provider_budget SET daily_bucket=daily_bucket-1 WHERE provider='lichess';
 IF public.ccp_online_rating_budget_acquire('lichess')->>'status' IS DISTINCT FROM 'quota'
 THEN RAISE EXCEPTION 'monthly budget must not reset with daily bucket'; END IF;
 UPDATE public.online_rating_provider_budget SET monthly_bucket=(monthly_bucket-interval '1 month')::date WHERE provider='lichess';
 grant1:=public.ccp_online_rating_budget_acquire('lichess');
 IF grant1->>'status' IS DISTINCT FROM 'admitted'
  OR NOT (SELECT daily_used=1 AND monthly_used=1 FROM public.online_rating_provider_budget WHERE provider='lichess')
 THEN RAISE EXCEPTION 'UTC rollover'; END IF;
 UPDATE public.online_rating_provider_budget SET lease_until=clock_timestamp()-interval '1 second' WHERE provider='lichess';
 IF public.ccp_online_rating_budget_acquire('lichess')->>'status' IS DISTINCT FROM 'operator_hold'
  OR public.ccp_online_rating_budget_finish('lichess',(grant1->>'token')::uuid,'completed',NULL)->>'status' IS DISTINCT FROM 'operator_hold'
  OR public.ccp_online_rating_budget_acquire('lichess')->>'status' IS DISTINCT FROM 'operator_hold'
 THEN RAISE EXCEPTION 'abandoned request must not silently reset'; END IF;
 grant2:=public.ccp_online_rating_budget_acquire('chesscom');
 IF grant2->>'status' IS DISTINCT FROM 'admitted'
  OR public.ccp_online_rating_budget_finish('chesscom',(grant2->>'token')::uuid,'rate_limited',NULL)->>'status' IS DISTINCT FROM 'operator_hold'
 THEN RAISE EXCEPTION 'unknown rate limit cannot silently resume'; END IF;
END $$;
RESET ROLE;
SELECT 'Synthetic budget lifecycle, stale token, UTC quotas, provider isolation and access boundaries passed';
