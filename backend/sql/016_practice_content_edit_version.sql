alter table content_practice_page
  add column if not exists edit_version integer not null default 1
  check (edit_version > 0);
