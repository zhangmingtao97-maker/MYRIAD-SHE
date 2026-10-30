-- Directory keys are stable slugs; display order is managed by the page editor.
alter table content_practice_entries
  drop constraint if exists content_practice_entries_key_check,
  drop constraint if exists content_practice_entries_sort_order_key,
  drop constraint if exists content_practice_entries_sort_order_check,
  add constraint content_practice_entries_key_format check (key ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  add constraint content_practice_entries_sort_order_check check (sort_order between 0 and 1000);
