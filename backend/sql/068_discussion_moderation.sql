-- 讨论内容发布、精华与用户参与限制。
--
-- publication_status 与旧的 status 并存：
--   * status 保留原有“待处理 / 已处理 / 不采纳”审核记录，兼容已发布的后台和小程序版本；
--   * publication_status 决定读者是否能在小程序看到内容，历史投稿一律保持 pending，绝不自动公开；
--   * 只有已发布的主经历可以设为精华，回复仍可发布但不能设精华。
alter table discussion_contributions
  add column if not exists publication_status text not null default 'pending',
  add column if not exists published_at timestamptz,
  add column if not exists published_by text,
  add column if not exists featured_at timestamptz,
  add column if not exists featured_by text,
  add column if not exists featured_order integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'discussion_contributions'::regclass
      and conname = 'discussion_contributions_publication_status_check'
  ) then
    alter table discussion_contributions
      add constraint discussion_contributions_publication_status_check
      check (publication_status in ('pending', 'published', 'hidden', 'rejected'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'discussion_contributions'::regclass
      and conname = 'discussion_contributions_featured_order_check'
  ) then
    alter table discussion_contributions
      add constraint discussion_contributions_featured_order_check
      check (featured_order between 0 and 999);
  end if;
end
$$;

create index if not exists discussion_contributions_publication_idx
  on discussion_contributions (issue_code, publication_status, published_at desc, id desc);

create index if not exists discussion_contributions_featured_idx
  on discussion_contributions (issue_code, featured_order asc, published_at desc)
  where publication_status = 'published' and featured_at is not null;

create index if not exists discussion_contributions_admin_publication_idx
  on discussion_contributions (publication_status, updated_at desc, id desc);

-- 限制仅作用于讨论投稿，不封禁账号的其他功能。
create table if not exists discussion_user_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 2 and 200),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by text
);

create index if not exists discussion_user_restrictions_user_active_idx
  on discussion_user_restrictions (user_id, starts_at desc, created_at desc);

create index if not exists discussion_user_restrictions_admin_status_idx
  on discussion_user_restrictions (revoked_at, ends_at, created_at desc);
