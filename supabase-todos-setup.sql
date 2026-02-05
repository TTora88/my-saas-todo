-- Supabase SQL Editor에서 실행하세요.
-- todos 테이블 생성 + anon 사용자 읽기/쓰기 허용 (RLS)

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  is_done boolean default false,
  category text not null check (category in ('work', 'life')),
  created_at timestamptz default now()
);

alter table public.todos enable row level security;

-- 기존 정책이 있으면 삭제 후 재생성 (선택)
-- drop policy if exists "Allow anon all on todos" on public.todos;

create policy "Allow anon all on todos"
  on public.todos
  for all
  to anon
  using (true)
  with check (true);
