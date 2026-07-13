-- Supabase SQL Editor에서 실행하세요.
-- 계정(user_id)별 앱 설정 저장

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  initial_screen text not null default 'today' check (
    initial_screen in ('inbox', 'today', 'next', 'calendar')
  ),
  show_completed text not null default 'open' check (show_completed in ('open', 'close')),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "Users can read own settings" on public.user_settings;
drop policy if exists "Users can insert own settings" on public.user_settings;
drop policy if exists "Users can update own settings" on public.user_settings;

create policy "Users can read own settings"
  on public.user_settings
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own settings"
  on public.user_settings
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own settings"
  on public.user_settings
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
