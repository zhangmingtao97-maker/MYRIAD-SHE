alter table content_practice_page
  add column if not exists intro_rich_text text not null default ''
    check (char_length(intro_rich_text) between 0 and 2000),
  add column if not exists intro_font_size integer not null default 28
    check (intro_font_size between 10 and 48),
  add column if not exists intro_color text not null default '#40362f'
    check (intro_color ~ '^#[0-9A-Fa-f]{6}$');

update content_practice_page
set intro_rich_text = intro
where intro_rich_text = '';
