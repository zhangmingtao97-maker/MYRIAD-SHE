alter table content_issues
  add column if not exists label_rich_text text not null default '',
  add column if not exists month_rich_text text not null default '',
  add column if not exists theme_rich_text text not null default '',
  add column if not exists question_rich_text text not null default '';

alter table content_issues
  drop constraint if exists content_issues_label_rich_text_check,
  drop constraint if exists content_issues_month_rich_text_check,
  drop constraint if exists content_issues_theme_rich_text_check,
  drop constraint if exists content_issues_question_rich_text_check,
  drop constraint if exists content_issues_home_meta_rich_text_check;

alter table content_issues
  add constraint content_issues_label_rich_text_check check (char_length(label_rich_text) <= 24000),
  add constraint content_issues_month_rich_text_check check (char_length(month_rich_text) <= 24000),
  add constraint content_issues_theme_rich_text_check check (char_length(theme_rich_text) <= 24000),
  add constraint content_issues_question_rich_text_check check (char_length(question_rich_text) <= 24000),
  add constraint content_issues_home_meta_rich_text_check check (char_length(home_meta_rich_text) <= 24000);
