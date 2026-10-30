alter table privacy_requests add column if not exists attempt_count integer not null default 0;
alter table privacy_requests add column if not exists next_attempt_at timestamptz not null default now();
alter table privacy_requests add column if not exists processing_started_at timestamptz;
alter table privacy_requests add column if not exists last_error text;

create index if not exists privacy_requests_processing_idx
  on privacy_requests(status, scheduled_for, next_attempt_at);
