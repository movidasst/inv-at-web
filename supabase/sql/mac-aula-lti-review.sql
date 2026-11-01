-- DRAFT, isolated academic staging ONLY, after mac-aula-evaluation-review.sql.
-- Not a migration and never applied to Directorio/MAC Profesional.
begin;
create role mac_aula_launch_worker nologin nosuperuser nobypassrls;
grant mac_aula_worker to mac_aula_launch_worker;
alter table mac_aula.sessions add column csrf_hash text;
create table mac_aula.launch_attempts(
 state_hash text primary key,binding_hash text not null,nonce_hash text not null,registration_id text not null,
 deployment_id text,expires_at timestamptz not null,consumed_at timestamptz
);
create table mac_aula.launch_daily_budget(day date primary key,used integer not null);
create table mac_aula.identities(
 id uuid primary key,platform_id text not null,deployment_id text not null,subject text not null,
 unique(platform_id,deployment_id,subject)
);
create table mac_aula.enrollments(
 actor_id uuid not null references mac_aula.identities(id),platform_id text not null,deployment_id text not null,course_id text not null,activity_id text not null,
 primary key(actor_id,platform_id,deployment_id,course_id,activity_id)
);
create table mac_aula.investigations(
 id uuid primary key,owner_id uuid not null,platform_id text not null,deployment_id text not null,course_id text not null,activity_id text not null,
 revision integer not null default 0,document jsonb not null,updated_at timestamptz not null default now(),
 unique(owner_id,platform_id,deployment_id,course_id,activity_id)
);
create table mac_aula.investigation_revisions(
 investigation_id uuid not null references mac_aula.investigations(id),revision integer not null,document jsonb not null,created_at timestamptz not null default now(),
 primary key(investigation_id,revision)
);
alter table mac_aula.submissions add column investigation_id uuid references mac_aula.investigations(id);
create unique index submission_revision_once on mac_aula.submissions(investigation_id,revision);
grant select,insert,update on mac_aula.launch_attempts,mac_aula.launch_daily_budget,mac_aula.identities,mac_aula.investigations to mac_aula_launch_worker;
grant select,insert on mac_aula.enrollments,mac_aula.investigation_revisions,mac_aula.submissions to mac_aula_launch_worker;
grant insert,update on mac_aula.sessions to mac_aula_launch_worker;
create policy issuer_session_insert on mac_aula.sessions for insert to mac_aula_launch_worker with check(true);
create policy issuer_session_revoke on mac_aula.sessions for update to mac_aula_launch_worker using(true) with check(true);
-- Backend-only bootstrap tables; no browser role can access these.
alter table mac_aula.launch_attempts enable row level security;
create policy issuer_attempt on mac_aula.launch_attempts to mac_aula_launch_worker using(true) with check(true);
alter table mac_aula.launch_daily_budget enable row level security;
create policy issuer_launch_budget on mac_aula.launch_daily_budget to mac_aula_launch_worker using(true) with check(true);
alter table mac_aula.identities enable row level security;
create policy issuer_identity on mac_aula.identities to mac_aula_launch_worker using(true) with check(true);
alter table mac_aula.enrollments enable row level security;
create policy issuer_enrollment on mac_aula.enrollments to mac_aula_launch_worker using(true) with check(true);
alter table mac_aula.investigations enable row level security;
create policy own_investigation on mac_aula.investigations to mac_aula_launch_worker
 using(owner_id::text=current_setting('mac_aula.actor',true) and platform_id=current_setting('mac_aula.platform',true) and deployment_id=current_setting('mac_aula.deployment',true) and course_id=current_setting('mac_aula.course',true) and activity_id=current_setting('mac_aula.activity',true))
 with check(owner_id::text=current_setting('mac_aula.actor',true) and current_setting('mac_aula.role',true)='student' and platform_id=current_setting('mac_aula.platform',true) and deployment_id=current_setting('mac_aula.deployment',true) and course_id=current_setting('mac_aula.course',true) and activity_id=current_setting('mac_aula.activity',true));
alter table mac_aula.investigation_revisions enable row level security;
create policy own_revision on mac_aula.investigation_revisions to mac_aula_launch_worker
 using(exists(select 1 from mac_aula.investigations i where i.id=investigation_id))
 with check(exists(select 1 from mac_aula.investigations i where i.id=investigation_id));
create policy own_submission_insert on mac_aula.submissions for insert to mac_aula_launch_worker
 with check(owner_id::text=current_setting('mac_aula.actor',true) and current_setting('mac_aula.role',true)='student' and exists(select 1 from mac_aula.investigations i where i.id=investigation_id and i.revision=submissions.revision and i.document=submissions.document and i.owner_id=submissions.owner_id and i.platform_id=submissions.platform_id and i.deployment_id=submissions.deployment_id and i.course_id=submissions.course_id and i.activity_id=submissions.activity_id));
revoke all on all tables in schema mac_aula from public,anon,authenticated;
commit;
