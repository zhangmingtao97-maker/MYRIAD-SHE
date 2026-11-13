alter table users add column if not exists profile_completed_at timestamptz;

update users
set profile_completed_at = coalesce(updated_at, created_at, now())
where profile_completed_at is null
  and nickname is not null
  and btrim(nickname) <> '';

create table if not exists wechat_profile_tokens (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  avatar_object_key text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists wechat_profile_tokens_active_idx
  on wechat_profile_tokens (expires_at)
  where consumed_at is null;

create index if not exists wechat_profile_tokens_user_idx
  on wechat_profile_tokens (user_id, created_at desc);
