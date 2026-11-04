-- 目录条目可以新增 / 删除：key 不再限定三个内置值，新增的条目用 target 指定跳转页面
alter table content_practice_entries
  add column if not exists target text;

update content_practice_entries
   set target = key
 where target is null
   and key in ('observation', 'shared-practice', 'daily-goods');

alter table content_practice_entries
  drop constraint if exists content_practice_entries_target_check,
  add constraint content_practice_entries_target_check
    check (target is null or target in ('observation', 'shared-practice', 'daily-goods', 'none'));