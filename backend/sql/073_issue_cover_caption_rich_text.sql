alter table content_issues
  add column if not exists home_cover_caption_left_rich_text text not null default '',
  add column if not exists home_cover_caption_right_rich_text text not null default '';

alter table content_issues
  drop constraint if exists content_issues_home_cover_caption_left_rich_text_check,
  drop constraint if exists content_issues_home_cover_caption_right_rich_text_check;

alter table content_issues
  add constraint content_issues_home_cover_caption_left_rich_text_check check (char_length(home_cover_caption_left_rich_text) <= 24000),
  add constraint content_issues_home_cover_caption_right_rich_text_check check (char_length(home_cover_caption_right_rich_text) <= 24000);
