-- Run after mac-security.sql, in the same connection. No credential or token is returned.
-- All test sessions, throttling counters and profile changes are rolled back.
begin;
do $$
declare
 member_record record;
 session_data jsonb;
 result_data jsonb;
 attempt integer;
begin
 if has_table_privilege('anon','private.mac_members','SELECT') or has_table_privilege('authenticated','private.mac_sessions','SELECT') then raise exception 'MAC tables are exposed';end if;
 if (select prosecdef from pg_proc where oid='public.mac_login(text,text)'::regprocedure) then raise exception 'Public login must be security invoker';end if;
 result_data:=public.mac_resume(repeat('f',64));
 if result_data->>'ok'<>'false' then raise exception 'Invented token accepted';end if;
 for attempt in 1..6 loop
  result_data:=public.mac_login('00000000000000000000','MAC-NONEXISTENT-TEST');
  if result_data->>'ok'<>'false' then raise exception 'Invalid credentials accepted';end if;
 end loop;
 if result_data->>'blocked'<>'true' then raise exception 'Server throttle did not block';end if;
 if exists(select 1 from public.acceso_integrante('00000000000000000000','MAC-NONEXISTENT-TEST')) then raise exception 'Legacy access bypasses throttle';end if;
 select id,cedula,codigo_integrante into member_record from public.integrantes
  where cedula~'^[0-9]{1,20}$' and length(btrim(coalesce(codigo_integrante,''))) between 1 and 80 limit 1;
 if not found then raise exception 'No valid member available for internal smoke test';end if;
 delete from private.mac_login_attempts where account_hash=sha256(convert_to('MAC:attempt:'||member_record.cedula,'UTF8'));
 session_data:=public.mac_login(member_record.cedula,member_record.codigo_integrante);
 if session_data->>'ok'<>'true' or session_data->>'key'!~'^[a-f0-9]{64}$' then raise exception 'Valid login failed';end if;
 result_data:=public.mac_resume(session_data->>'token');
 if result_data->>'scope'<>session_data->>'scope' or result_data->>'key'<>session_data->>'key' then raise exception 'Session resume mismatch';end if;
 if not exists(select 1 from public.acceso_integrante(member_record.cedula,member_record.codigo_integrante)) then raise exception 'Legacy access compatibility failed';end if;
 perform public.mac_logout(session_data->>'token');
 result_data:=public.mac_resume(session_data->>'token');
 if result_data->>'ok'<>'false' then raise exception 'Revoked token accepted';end if;
end;
$$;
rollback;
