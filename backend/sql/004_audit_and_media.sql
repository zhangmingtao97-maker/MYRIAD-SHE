create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('user', 'admin', 'system')),
  actor_id text,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on audit_logs(created_at desc);
create index if not exists audit_logs_resource_idx on audit_logs(resource_type, resource_id, created_at desc);

alter table content_issues add column if not exists cover_object_key text;
alter table content_issues add column if not exists micro_voice_object_key text;
