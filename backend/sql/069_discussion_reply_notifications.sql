-- “一起谈谈”回复对象、一次性订阅授权与审核后发送队列。
--
-- 一次微信订阅授权只适用于一次下发，因此授权绑定到用户提交的具体内容；
-- 当该内容收到一条审核通过的新回复时，仅保留一条通知并消费一次授权。
alter table discussion_contributions
  add column if not exists parent_contribution_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'discussion_contributions'::regclass
      and conname = 'discussion_contributions_parent_contribution_id_fkey'
  ) then
    alter table discussion_contributions
      add constraint discussion_contributions_parent_contribution_id_fkey
      foreign key (parent_contribution_id) references discussion_contributions(id) on delete set null;
  end if;
end
$$;

create index if not exists discussion_contributions_parent_idx
  on discussion_contributions (parent_contribution_id, publication_status, published_at desc)
  where parent_contribution_id is not null;

create table if not exists discussion_subscription_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  contribution_id uuid not null references discussion_contributions(id) on delete cascade,
  template_id text not null check (char_length(template_id) between 10 and 128),
  scene text not null default 'reply_received' check (scene = 'reply_received'),
  request_id text not null check (char_length(request_id) between 8 and 128),
  accepted_at timestamptz not null default now(),
  reserved_notification_id uuid,
  reserved_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);

create index if not exists discussion_subscription_consents_available_idx
  on discussion_subscription_consents (contribution_id, user_id, template_id, accepted_at)
  where consumed_at is null and reserved_notification_id is null;

create index if not exists discussion_subscription_consents_notification_idx
  on discussion_subscription_consents (reserved_notification_id)
  where reserved_notification_id is not null;

create table if not exists discussion_reply_notifications (
  id uuid primary key default gen_random_uuid(),
  parent_contribution_id uuid not null references discussion_contributions(id) on delete cascade,
  reply_contribution_id uuid not null references discussion_contributions(id) on delete cascade,
  recipient_user_id uuid not null references users(id) on delete cascade,
  consent_id uuid not null references discussion_subscription_consents(id) on delete restrict,
  template_id text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reply_contribution_id),
  check (parent_contribution_id <> reply_contribution_id)
);

create index if not exists discussion_reply_notifications_pending_idx
  on discussion_reply_notifications (next_attempt_at, created_at, id)
  where status in ('queued', 'sending');

create index if not exists discussion_reply_notifications_recipient_idx
  on discussion_reply_notifications (recipient_user_id, created_at desc);
