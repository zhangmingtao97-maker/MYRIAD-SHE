alter table content_practice_page
  add column if not exists title_rich_text text not null default '实践'
    check (char_length(title_rich_text) between 1 and 2000),
  add column if not exists title_font_size integer not null default 12
    check (title_font_size between 10 and 48),
  add column if not exists title_color text not null default '#8b6b58'
    check (title_color ~ '^#[0-9A-Fa-f]{6}$');

update content_practice_page
set title_rich_text = case when title = '实践' then '日常实践' else title end
where title_rich_text = '实践';
