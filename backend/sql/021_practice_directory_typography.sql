alter table content_practice_entries
  add column if not exists context_rich_text text not null default ''
    check (char_length(context_rich_text) between 0 and 2000),
  add column if not exists context_font_size integer not null default 12
    check (context_font_size between 10 and 48),
  add column if not exists context_color text not null default '#8b6b58'
    check (context_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists title_rich_text text not null default ''
    check (char_length(title_rich_text) between 0 and 2000),
  add column if not exists title_font_size integer not null default 16
    check (title_font_size between 10 and 48),
  add column if not exists title_color text not null default '#40362f'
    check (title_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists description_rich_text text not null default ''
    check (char_length(description_rich_text) between 0 and 2000),
  add column if not exists description_font_size integer not null default 13
    check (description_font_size between 10 and 48),
  add column if not exists description_color text not null default '#40362f'
    check (description_color ~ '^#[0-9A-Fa-f]{6}$');

update content_practice_entries
set context_rich_text = case key
      when 'observation' then '一个人 · 随时可以开始'
      when 'shared-practice' then '与他人 · 从一个问题开始'
      when 'daily-goods' then '支持实践的物'
      else context_rich_text
    end,
    title_rich_text = title,
    description_rich_text = case
      when key = 'shared-practice' and description = '有真实活动时才开放' then '本期线上讨论 · 未来线下相见'
      else description
    end
where context_rich_text = '' or title_rich_text = '' or description_rich_text = '';
