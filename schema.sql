-- Run this script once in Supabase: SQL Editor -> New query -> Run.
-- Each student can only read and change rows belonging to their own account.

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title varchar(100) not null,
  subject varchar(50) not null,
  due_date date not null,
  priority varchar(20) not null default 'Normal',
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists assignments_user_due_idx
  on public.assignments(user_id, due_date);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic varchar(90) not null,
  subject varchar(50) not null,
  session_date date not null,
  session_time time not null,
  created_at timestamptz not null default now()
);

create index if not exists study_sessions_user_date_idx
  on public.study_sessions(user_id, session_date, session_time);

alter table public.assignments enable row level security;
alter table public.study_sessions enable row level security;

drop policy if exists "Students can read their own assignments" on public.assignments;
create policy "Students can read their own assignments"
  on public.assignments for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Students can add their own assignments" on public.assignments;
create policy "Students can add their own assignments"
  on public.assignments for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Students can update their own assignments" on public.assignments;
create policy "Students can update their own assignments"
  on public.assignments for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Students can delete their own assignments" on public.assignments;
create policy "Students can delete their own assignments"
  on public.assignments for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Students can read their own study sessions" on public.study_sessions;
create policy "Students can read their own study sessions"
  on public.study_sessions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Students can add their own study sessions" on public.study_sessions;
create policy "Students can add their own study sessions"
  on public.study_sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Students can delete their own study sessions" on public.study_sessions;
create policy "Students can delete their own study sessions"
  on public.study_sessions for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Allow signed-in users to use the tables; RLS policies above still restrict
-- every row to its owner.
revoke all on public.assignments from anon;
revoke all on public.study_sessions from anon;
grant select, insert, update, delete on public.assignments to authenticated;
grant select, insert, delete on public.study_sessions to authenticated;
