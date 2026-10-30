alter table content_issues
  add column if not exists home_cover_caption_left text not null default '人物纪实·时雨'
    check (char_length(home_cover_caption_left) <= 80 and home_cover_caption_left !~ E'[\r\n]'),
  add column if not exists home_cover_caption_right text not null default '本期封面'
    check (char_length(home_cover_caption_right) <= 80 and home_cover_caption_right !~ E'[\r\n]');
