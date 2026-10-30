alter table content_privacy_page
  add column if not exists draft_copy jsonb,
  add column if not exists published_version integer not null default 1 check (published_version > 0),
  add column if not exists published_at timestamptz not null default now();

update content_privacy_page set draft_copy = copy where draft_copy is null;

alter table content_privacy_policy
  add column if not exists draft_title jsonb,
  add column if not exists draft_intro jsonb,
  add column if not exists draft_effective_date text,
  add column if not exists draft_body jsonb,
  add column if not exists published_version integer not null default 1 check (published_version > 0),
  add column if not exists published_at timestamptz not null default now();

update content_privacy_policy
set draft_title = title,
    draft_intro = intro,
    draft_effective_date = effective_date,
    draft_body = body
where draft_title is null or draft_intro is null or draft_effective_date is null or draft_body is null;

create table if not exists content_privacy_revisions (
  id bigserial primary key,
  content_key text not null check (content_key in ('privacy-page', 'privacy-policy')),
  version integer not null check (version > 0),
  content jsonb not null,
  published_by text,
  published_at timestamptz not null default now(),
  unique (content_key, version)
);

insert into content_privacy_revisions (content_key, version, content)
select 'privacy-page', published_version, jsonb_build_object('copy', copy)
from content_privacy_page
on conflict (content_key, version) do nothing;

insert into content_privacy_revisions (content_key, version, content)
select 'privacy-policy', published_version,
       jsonb_build_object('title', title, 'intro', intro, 'effectiveDate', effective_date, 'body', body)
from content_privacy_policy
on conflict (content_key, version) do nothing;
