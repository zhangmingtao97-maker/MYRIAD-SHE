-- 共同实践页文案「按期存储」。
--
-- 背景：原先把线上/线下文案、四条规则等 30+ 个字段平铺在 content_practice_page.shared_practice_copy 里，
-- 每换一期都要逐条改动，且「段落 / 规则」数量被写死（paragraph1-3、rule1-4）。
--
-- 本迁移：
--   1) 新增 content_issue_practice_copy，按期保存一份文案（jsonb），支持列表化的段落与规则；
--   2) 不删除旧字段：content_practice_page.shared_practice_copy 继续作为「全局默认值 / 回退」，
--      某期没有独立文案时读取全局值，保证历史数据与未配置的期刊都能正常渲染。

create table if not exists content_issue_practice_copy (
  issue_id uuid primary key references content_issues(id) on delete cascade,
  copy jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists content_issue_practice_copy_updated_idx
  on content_issue_practice_copy (updated_at desc);
