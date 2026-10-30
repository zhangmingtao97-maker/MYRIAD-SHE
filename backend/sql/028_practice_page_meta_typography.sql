alter table content_practice_page
  add column if not exists meta_left_rich_text text not null default '实践'
    check (char_length(meta_left_rich_text) between 1 and 2000),
  add column if not exists meta_left_font_size integer not null default 12
    check (meta_left_font_size between 10 and 48),
  add column if not exists meta_left_color text not null default '#8b6b58'
    check (meta_left_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists meta_right_rich_text text not null default '此刻归安'
    check (char_length(meta_right_rich_text) between 1 and 2000),
  add column if not exists meta_right_font_size integer not null default 12
    check (meta_right_font_size between 10 and 48),
  add column if not exists meta_right_color text not null default '#8b6b58'
    check (meta_right_color ~ '^#[0-9A-Fa-f]{6}$');
