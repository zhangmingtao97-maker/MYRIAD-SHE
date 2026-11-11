alter table content_practice_page
  add column if not exists footer_copy jsonb not null default '{}'::jsonb;

alter table content_practice_page
  drop constraint if exists content_practice_page_footer_copy_check;

alter table content_practice_page
  add constraint content_practice_page_footer_copy_check check (jsonb_typeof(footer_copy) = 'object');
