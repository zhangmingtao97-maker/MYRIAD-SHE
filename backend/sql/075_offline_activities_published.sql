-- 线下活动是否已发布。
-- 默认关闭：活动文案仍可由后台提前编辑，但小程序共同实践页不展示线下活动区块。

alter table content_issue_practice_copy
  add column if not exists offline_activities_published boolean not null default false;
