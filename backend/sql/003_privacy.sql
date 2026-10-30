alter table users add column if not exists settings jsonb not null default '{}'::jsonb;

create table if not exists privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  status text not null check (status in ('pending', 'cancelled', 'completed', 'failed')),
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null,
  cancelled_at timestamptz,
  completed_at timestamptz
);

create index if not exists privacy_requests_user_requested_idx on privacy_requests(user_id, requested_at desc);
create index if not exists privacy_requests_pending_schedule_idx on privacy_requests(status, scheduled_for);
create unique index if not exists privacy_requests_one_pending_per_user_idx on privacy_requests(user_id) where status = 'pending';
