-- MAC sessions and encrypted local storage. Apply once, before deploying the client.
-- The shared acceso_integrante signature and result columns remain compatible.
begin;
create schema if not exists private;
create table private.mac_members (
 member_id bigint primary key references public.integrantes(id) on delete cascade,
 scope text not null unique default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),
 storage_key text not null default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','')
);
create table private.mac_sessions (
 token_hash bytea primary key,
 member_id bigint not null references private.mac_members(member_id) on delete cascade,
 credential_stamp bytea not null,
 expires_at timestamptz not null default now()+interval '60 minutes'
);
create index mac_sessions_expiry on private.mac_sessions(expires_at);
create table private.mac_login_attempts (
 account_hash bytea primary key,
 failures integer not null default 0,
 window_start timestamptz not null default now()
);
alter table private.mac_members enable row level security;
alter table private.mac_sessions enable row level security;
alter table private.mac_login_attempts enable row level security;
revoke all on private.mac_members,private.mac_sessions,private.mac_login_attempts from public,anon,authenticated;

create or replace function private.mac_access(p_action text,p_token text default null,p_cedula text default null,p_codigo text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_cedula text:=regexp_replace(coalesce(p_cedula,''),'\D','','g');
 v_hash bytea;
 v_attempt private.mac_login_attempts%rowtype;
 v_member public.integrantes%rowtype;
 v_storage private.mac_members%rowtype;
 v_session private.mac_sessions%rowtype;
 v_token text;
 v_profile jsonb;
begin
 if p_action in ('login','profile') then
  if length(v_cedula) not between 1 and 20 or length(btrim(coalesce(p_codigo,''))) not between 1 and 80 then
   return case when p_action='profile' then '[]'::jsonb else jsonb_build_object('ok',false) end;
  end if;
  v_hash:=sha256(convert_to('MAC:attempt:'||v_cedula,'UTF8'));
  insert into private.mac_login_attempts(account_hash) values(v_hash) on conflict do nothing;
  select * into v_attempt from private.mac_login_attempts where account_hash=v_hash for update;
  if v_attempt.window_start < now()-interval '15 minutes' then
   update private.mac_login_attempts set failures=0,window_start=now() where account_hash=v_hash;
   v_attempt.failures:=0;
  end if;
  if v_attempt.failures>=5 then
   return case when p_action='profile' then '[]'::jsonb else jsonb_build_object('ok',false,'blocked',true) end;
  end if;
  select i.* into v_member from public.integrantes i
   where i.cedula=v_cedula and length(btrim(coalesce(i.codigo_integrante,'')))>0
   and upper(btrim(i.codigo_integrante))=upper(btrim(p_codigo)) limit 1;
  if not found then
   update private.mac_login_attempts set failures=failures+1 where account_hash=v_hash;
   return case when p_action='profile' then '[]'::jsonb else jsonb_build_object('ok',false,'blocked',v_attempt.failures+1>=5) end;
  end if;
  delete from private.mac_login_attempts where account_hash=v_hash;
  if p_action='profile' then
   select jsonb_build_array(to_jsonb(profile)) into v_profile from (
    select v_member.cedula,v_member.nombres,v_member.apellidos,v_member.edad,v_member.genero,
    v_member.estado,v_member.municipio,v_member.grado,v_member.carrera,v_member.postgrado,
    v_member.wasap,v_member.mostrar_wasap,v_member.correo,v_member.laboral,v_member.foto_url,
    v_member.doctorado,v_member.linkedin
   ) profile;
   return v_profile;
  end if;
  insert into private.mac_members(member_id) values(v_member.id) on conflict do nothing;
  select * into v_storage from private.mac_members where member_id=v_member.id;
  v_token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  delete from private.mac_sessions where expires_at<=now();
  delete from private.mac_login_attempts where window_start<now()-interval '1 day';
  insert into private.mac_sessions(token_hash,member_id,credential_stamp)
   values(sha256(convert_to(v_token,'UTF8')),v_member.id,sha256(convert_to(upper(btrim(v_member.codigo_integrante)),'UTF8')))
   returning * into v_session;
 elsif p_action in ('resume','logout') then
  if coalesce(p_token,'')!~'^[a-f0-9]{64}$' then return jsonb_build_object('ok',false);end if;
  if p_action='logout' then
   delete from private.mac_sessions where token_hash=sha256(convert_to(p_token,'UTF8'));
   return jsonb_build_object('ok',true);
  end if;
  select * into v_session from private.mac_sessions where token_hash=sha256(convert_to(p_token,'UTF8')) and expires_at>now();
  if not found then return jsonb_build_object('ok',false);end if;
  select * into v_member from public.integrantes where id=v_session.member_id;
  if not found or v_session.credential_stamp<>sha256(convert_to(upper(btrim(coalesce(v_member.codigo_integrante,''))),'UTF8')) then return jsonb_build_object('ok',false);end if;
  select * into v_storage from private.mac_members where member_id=v_member.id;
 else return jsonb_build_object('ok',false);
 end if;
 return jsonb_build_object('ok',true,'token',v_token,'scope',v_storage.scope,'key',v_storage.storage_key,
  'name',concat_ws(' ',v_member.nombres,v_member.apellidos),'expires_at',v_session.expires_at);
end;
$$;
revoke all on function private.mac_access(text,text,text,text) from public;
grant usage on schema private to anon,authenticated;
grant execute on function private.mac_access(text,text,text,text) to anon,authenticated;

create or replace function public.mac_login(p_cedula text,p_codigo text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.mac_access('login',null,p_cedula,p_codigo)
$$;
create or replace function public.mac_resume(p_token text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.mac_access('resume',p_token)
$$;
create or replace function public.mac_logout(p_token text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.mac_access('logout',p_token)
$$;
create or replace function public.acceso_integrante(p_cedula text,p_codigo text)
returns table(cedula text,nombres text,apellidos text,edad integer,genero text,estado text,municipio text,grado text,carrera text,postgrado text,wasap text,mostrar_wasap boolean,correo text,laboral text,foto_url text,doctorado text,linkedin text)
language sql volatile security invoker set search_path='' as $$
 select * from jsonb_to_recordset(private.mac_access('profile',null,p_cedula,p_codigo))
 as r(cedula text,nombres text,apellidos text,edad integer,genero text,estado text,municipio text,grado text,carrera text,postgrado text,wasap text,mostrar_wasap boolean,correo text,laboral text,foto_url text,doctorado text,linkedin text)
$$;
revoke all on function public.mac_login(text,text),public.mac_resume(text),public.mac_logout(text) from public;
grant execute on function public.mac_login(text,text),public.mac_resume(text),public.mac_logout(text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
