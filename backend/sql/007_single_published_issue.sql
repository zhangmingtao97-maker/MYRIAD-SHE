-- The mini program has one current issue as the home and observation entry point.
-- Normalize existing data before enforcing that invariant for future writes.
with current_issue as (
  select id
  from content_issues
  where status = 'published'
  order by updated_at desc, id desc
  limit 1
)
update content_issues
set status = 'archived', updated_at = now()
where status = 'published'
  and id not in (select id from current_issue);

create unique index if not exists content_issues_single_published_idx
  on content_issues (status)
  where status = 'published';
