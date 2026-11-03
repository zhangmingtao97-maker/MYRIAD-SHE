-- 本期讨论内容举报。
--
-- 小程序「本期讨论」里的「举报」原先只在本机保存标记，运营团队看不到。这里把举报落到云端：
--   * 用户在小程序提交举报后写入本表，后台「用户经历审核」页的内容举报区块可查看与处理；
--   * thread_* 快照由后端按已发布期刊的讨论内容解析，避免前端伪造被举报内容；
--   * status：pending（待处理）→ handled（已处理）/ dismissed（不采纳）；
--   * revision 用于后台并发处理时的乐观锁；
--   * 同一用户对同一条内容的重复举报更新原记录（unique 约束），不会刷出多条。

create table if not exists discussion_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  issue_code text not null,
  issue_label_snapshot text not null,
  thread_id text not null,
  thread_author_snapshot text,
  thread_body_snapshot text,
  reason text not null check (reason in ('inappropriate', 'spam', 'privacy', 'other')),
  detail text,
  status text not null default 'pending' check (status in ('pending', 'handled', 'dismissed')),
  revision integer not null default 1 check (revision > 0),
  handled_by text,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, issue_code, thread_id)
);

create index if not exists discussion_reports_status_updated_idx
  on discussion_reports(status, updated_at desc, id desc);

create index if not exists discussion_reports_issue_updated_idx
  on discussion_reports(issue_code, updated_at desc);
