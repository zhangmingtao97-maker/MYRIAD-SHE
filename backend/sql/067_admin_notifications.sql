-- 管理后台站内通知与企微应用消息投递状态。
create table if not exists admin_notifications (
  id uuid primary key default gen_random_uuid(),
  source_audit_id uuid unique references audit_logs(id) on delete set null,
  event_type text not null,
  title text not null,
  content text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  wecom_status text not null default 'pending'
    check (wecom_status in ('pending', 'sent', 'skipped', 'failed')),
  wecom_error text,
  wecom_attempts integer not null default 0 check (wecom_attempts >= 0),
  created_at timestamptz not null default now()
);

create index if not exists admin_notifications_created_at_idx
  on admin_notifications (created_at desc, id desc);

create index if not exists admin_notifications_wecom_status_idx
  on admin_notifications (wecom_status, created_at);

-- 已读状态按管理员独立保存，避免某位管理员读取后影响其他人。
create table if not exists admin_notification_reads (
  notification_id uuid not null references admin_notifications(id) on delete cascade,
  admin_id text not null,
  read_at timestamptz not null default now(),
  primary key (notification_id, admin_id)
);

create index if not exists admin_notification_reads_admin_idx
  on admin_notification_reads (admin_id, read_at desc);
