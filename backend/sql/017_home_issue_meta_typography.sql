alter table content_issues
  add column if not exists home_meta_rich_text text not null default ''
    check (char_length(home_meta_rich_text) <= 2000),
  add column if not exists home_meta_font_size integer not null default 16
    check (home_meta_font_size between 12 and 48),
  add column if not exists home_meta_color text not null default '#40362f'
    check (home_meta_color ~ '^#[0-9A-Fa-f]{6}$');
