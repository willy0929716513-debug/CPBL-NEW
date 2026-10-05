-- Pathlight 的資料庫結構。
--
-- 使用方式：登入 supabase.com，開你的專案 → 左側選單 SQL Editor →
-- New query → 把這整份檔案貼進去 → Run。只需要做一次。
--
-- 每個資料表都有 user_id，並且開啟 Row Level Security（RLS）：每個使用者
-- 永遠只能讀寫自己的資料，即使拿到別人的 id 也查不到——這個限制是在
-- 資料庫層級強制的，不是只靠前端程式碼擋，就算前端有 bug 也不會洩漏資料。

create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  file_name text not null,
  context text not null,
  analysis jsonb not null
);

create table if not exists study_plan_progress (
  material_id uuid primary key references materials (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  completed_steps int[] not null default '{}'
);

create table if not exists flashcard_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id uuid not null references materials (id) on delete cascade,
  created_at timestamptz not null default now(),
  cards jsonb not null
);

create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id uuid not null references materials (id) on delete cascade,
  created_at timestamptz not null default now(),
  questions jsonb not null,
  answers jsonb not null,
  completed_at timestamptz
);

create table if not exists written_exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id uuid not null references materials (id) on delete cascade,
  created_at timestamptz not null default now(),
  exam jsonb not null,
  answers jsonb not null,
  graded jsonb
);

create table if not exists oral_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id uuid not null references materials (id) on delete cascade,
  created_at timestamptz not null default now(),
  questions jsonb not null,
  results jsonb not null default '[]'
);

create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id uuid not null references materials (id) on delete cascade,
  created_at timestamptz not null default now(),
  lesson jsonb not null
);

create table if not exists podcasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id uuid not null references materials (id) on delete cascade,
  created_at timestamptz not null default now(),
  podcast jsonb not null
);

create index if not exists materials_user_id_idx on materials (user_id);
create index if not exists flashcard_sets_material_id_idx on flashcard_sets (material_id);
create index if not exists quiz_attempts_material_id_idx on quiz_attempts (material_id);
create index if not exists written_exams_material_id_idx on written_exams (material_id);
create index if not exists oral_sessions_material_id_idx on oral_sessions (material_id);
create index if not exists lessons_material_id_idx on lessons (material_id);
create index if not exists podcasts_material_id_idx on podcasts (material_id);

alter table materials enable row level security;
alter table study_plan_progress enable row level security;
alter table flashcard_sets enable row level security;
alter table quiz_attempts enable row level security;
alter table written_exams enable row level security;
alter table oral_sessions enable row level security;
alter table lessons enable row level security;
alter table podcasts enable row level security;

drop policy if exists "owner_select" on materials;
create policy "owner_select" on materials for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on materials;
create policy "owner_insert" on materials for insert with check (auth.uid() = user_id);
drop policy if exists "owner_update" on materials;
create policy "owner_update" on materials for update using (auth.uid() = user_id);
drop policy if exists "owner_delete" on materials;
create policy "owner_delete" on materials for delete using (auth.uid() = user_id);

drop policy if exists "owner_select" on study_plan_progress;
create policy "owner_select" on study_plan_progress for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on study_plan_progress;
create policy "owner_insert" on study_plan_progress for insert with check (auth.uid() = user_id);
drop policy if exists "owner_update" on study_plan_progress;
create policy "owner_update" on study_plan_progress for update using (auth.uid() = user_id);
drop policy if exists "owner_delete" on study_plan_progress;
create policy "owner_delete" on study_plan_progress for delete using (auth.uid() = user_id);

drop policy if exists "owner_select" on flashcard_sets;
create policy "owner_select" on flashcard_sets for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on flashcard_sets;
create policy "owner_insert" on flashcard_sets for insert with check (auth.uid() = user_id);
drop policy if exists "owner_update" on flashcard_sets;
create policy "owner_update" on flashcard_sets for update using (auth.uid() = user_id);
drop policy if exists "owner_delete" on flashcard_sets;
create policy "owner_delete" on flashcard_sets for delete using (auth.uid() = user_id);

drop policy if exists "owner_select" on quiz_attempts;
create policy "owner_select" on quiz_attempts for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on quiz_attempts;
create policy "owner_insert" on quiz_attempts for insert with check (auth.uid() = user_id);
drop policy if exists "owner_update" on quiz_attempts;
create policy "owner_update" on quiz_attempts for update using (auth.uid() = user_id);
drop policy if exists "owner_delete" on quiz_attempts;
create policy "owner_delete" on quiz_attempts for delete using (auth.uid() = user_id);

drop policy if exists "owner_select" on written_exams;
create policy "owner_select" on written_exams for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on written_exams;
create policy "owner_insert" on written_exams for insert with check (auth.uid() = user_id);
drop policy if exists "owner_update" on written_exams;
create policy "owner_update" on written_exams for update using (auth.uid() = user_id);
drop policy if exists "owner_delete" on written_exams;
create policy "owner_delete" on written_exams for delete using (auth.uid() = user_id);

drop policy if exists "owner_select" on oral_sessions;
create policy "owner_select" on oral_sessions for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on oral_sessions;
create policy "owner_insert" on oral_sessions for insert with check (auth.uid() = user_id);
drop policy if exists "owner_update" on oral_sessions;
create policy "owner_update" on oral_sessions for update using (auth.uid() = user_id);
drop policy if exists "owner_delete" on oral_sessions;
create policy "owner_delete" on oral_sessions for delete using (auth.uid() = user_id);

drop policy if exists "owner_select" on lessons;
create policy "owner_select" on lessons for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on lessons;
create policy "owner_insert" on lessons for insert with check (auth.uid() = user_id);
drop policy if exists "owner_update" on lessons;
create policy "owner_update" on lessons for update using (auth.uid() = user_id);
drop policy if exists "owner_delete" on lessons;
create policy "owner_delete" on lessons for delete using (auth.uid() = user_id);

drop policy if exists "owner_select" on podcasts;
create policy "owner_select" on podcasts for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on podcasts;
create policy "owner_insert" on podcasts for insert with check (auth.uid() = user_id);
drop policy if exists "owner_update" on podcasts;
create policy "owner_update" on podcasts for update using (auth.uid() = user_id);
drop policy if exists "owner_delete" on podcasts;
create policy "owner_delete" on podcasts for delete using (auth.uid() = user_id);
