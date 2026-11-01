-- DRAFT for an isolated staging database. NOT a production migration; not applied remotely.
-- A verified LTI launch/submit backend must populate sessions/submissions, never the browser.
begin;
create schema mac_aula;
revoke all on schema mac_aula from public,anon,authenticated;
-- Provision a dedicated login separately and grant ONLY this non-login role to it.
create role mac_aula_worker nologin nosuperuser nobypassrls;
grant usage on schema mac_aula to mac_aula_worker;

create table mac_aula.sessions(
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 actor_id uuid not null,role text not null check(role in ('student','teacher')),
 platform_id text not null,deployment_id text not null,course_id text not null,activity_id text not null,
 expires_at timestamptz not null,revoked_at timestamptz
);
create table mac_aula.submissions(
 id uuid primary key,owner_id uuid not null,platform_id text not null,deployment_id text not null,course_id text not null,activity_id text not null,
 case_id text not null,case_version integer not null check(case_version>0),rubric_version text not null,
 revision integer not null check(revision>=0),fictitious boolean not null default false,
 snapshot_hash text not null check(snapshot_hash ~ '^[a-f0-9]{64}$'),document jsonb not null check(jsonb_typeof(document)='object'),
 submitted_at timestamptz not null default now()
);
create table mac_aula.evaluations(
 id uuid primary key,submission_id uuid not null references mac_aula.submissions(id),snapshot_hash text not null,
 evaluator_version text not null,provider_identity text not null,
 state text not null check(state in ('queued','running','proposed','pending_correction','reviewed_proposal')),
 lease_id uuid,lease_until timestamptz,result jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(submission_id,snapshot_hash,evaluator_version,provider_identity)
);
create table mac_aula.evaluation_attempts(
 id uuid primary key,evaluation_id uuid not null references mac_aula.evaluations(id),lease_id uuid not null,
 actor_id uuid not null,request_id uuid not null,started_at timestamptz not null default now(),finished_at timestamptz,
 outcome text not null check(outcome in ('started','proposed','pending_correction')),error_code text,
 unique(evaluation_id,lease_id)
);
create table mac_aula.evaluation_reviews(
 id uuid primary key,evaluation_id uuid not null references mac_aula.evaluations(id),reviewer_id uuid not null,
 total numeric not null check(total between 0 and 100),review jsonb not null,reason text not null check(length(reason) between 1 and 2000),review_hash text not null,
 created_at timestamptz not null default now(),unique(evaluation_id,reviewer_id,review_hash)
);
create table mac_aula.evaluation_daily_budget(day date primary key,used integer not null check(used>=0));

-- No service-role bypass, public RPC, SECURITY DEFINER, or grants to browser roles.
alter table mac_aula.sessions enable row level security;
alter table mac_aula.submissions enable row level security;
alter table mac_aula.evaluations enable row level security;
alter table mac_aula.evaluation_attempts enable row level security;
alter table mac_aula.evaluation_reviews enable row level security;
alter table mac_aula.evaluation_daily_budget enable row level security;
revoke all on all tables in schema mac_aula from public,anon,authenticated;
grant select on mac_aula.sessions,mac_aula.submissions to mac_aula_worker;
grant select,insert,update on mac_aula.evaluations,mac_aula.evaluation_attempts,mac_aula.evaluation_daily_budget to mac_aula_worker;
grant select,insert on mac_aula.evaluation_reviews to mac_aula_worker;
create policy worker_session_lookup on mac_aula.sessions for select to mac_aula_worker using(true);
create policy scope_submission on mac_aula.submissions for select to mac_aula_worker using(
 platform_id=current_setting('mac_aula.platform',true) and deployment_id=current_setting('mac_aula.deployment',true)
 and course_id=current_setting('mac_aula.course',true) and activity_id=current_setting('mac_aula.activity',true)
 and (owner_id::text=current_setting('mac_aula.actor',true) or current_setting('mac_aula.role',true)='teacher')
);
create policy scope_evaluation on mac_aula.evaluations to mac_aula_worker
 using(exists(select 1 from mac_aula.submissions s where s.id=submission_id))
 with check(exists(select 1 from mac_aula.submissions s where s.id=submission_id));
create policy scope_attempt on mac_aula.evaluation_attempts to mac_aula_worker
 using(exists(select 1 from mac_aula.evaluations e where e.id=evaluation_id))
 with check(exists(select 1 from mac_aula.evaluations e where e.id=evaluation_id));
create policy teacher_review_read on mac_aula.evaluation_reviews for select to mac_aula_worker
 using(current_setting('mac_aula.role',true)='teacher' and exists(select 1 from mac_aula.evaluations e where e.id=evaluation_id));
create policy teacher_review_insert on mac_aula.evaluation_reviews for insert to mac_aula_worker
 with check(current_setting('mac_aula.role',true)='teacher' and reviewer_id::text=current_setting('mac_aula.actor',true) and exists(select 1 from mac_aula.evaluations e where e.id=evaluation_id));
create policy worker_budget on mac_aula.evaluation_daily_budget to mac_aula_worker using(true) with check(true);
commit;
-- Rollback is intentionally NOT an executable DROP. Preserve/export assessment history first.
