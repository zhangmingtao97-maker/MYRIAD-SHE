alter table content_practice_page
  add column if not exists shared_practice_copy jsonb not null default '{}'::jsonb;
