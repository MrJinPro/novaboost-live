create table if not exists public.payment_interest_surveys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  entry_point text not null,
  trigger_label text not null,
  preferred_methods text[] not null default '{}',
  comment text null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.payment_interest_surveys enable row level security;

drop policy if exists "payment_interest_surveys_insert_anyone" on public.payment_interest_surveys;

create policy "payment_interest_surveys_insert_anyone"
on public.payment_interest_surveys
for insert
to anon, authenticated
with check (true);