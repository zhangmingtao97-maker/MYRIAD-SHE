-- 本期讨论页独立草稿与发布版本。
--
-- 原先讨论文案和示例经历放在 content_issues.draft_content 中，必须随整期期刊发布，
-- 编辑一期讨论就要重新发布整本刊。这里为每期讨论保存独立的草稿与已发布版本：
--   * draft_content：后台当前编辑中的讨论页内容；
--   * published_content：小程序当前展示的讨论页内容，只在「发布本期讨论」时更新；
--   * edit_version：后台并发保存的版本号；
--   * published_version：讨论页自己的发布版本，从 1 开始递增。
-- 没有独立发布内容时，公开接口继续回退到期刊发布快照，保证历史期刊不受影响。

create table if not exists content_discussion_pages (
  issue_id uuid primary key references content_issues(id) on delete cascade,
  draft_content jsonb not null,
  published_content jsonb,
  edit_version integer not null default 1 check (edit_version > 0),
  published_version integer not null default 0 check (published_version >= 0),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text,
  published_by text
);

create index if not exists content_discussion_pages_published_idx
  on content_discussion_pages (published_at desc)
  where published_content is not null;
