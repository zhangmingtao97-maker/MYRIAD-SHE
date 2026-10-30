create table if not exists content_legal_documents (
  content_key text primary key check (content_key in ('privacy-policy', 'user-agreement')),
  edit_version integer not null default 1 check (edit_version > 0),
  draft jsonb not null,
  published jsonb,
  published_version integer not null default 0 check (published_version >= 0),
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Preserve the existing privacy draft, publication and version numbers.
insert into content_legal_documents (content_key, edit_version, draft, published, published_version, published_at)
select 'privacy-policy', edit_version,
  jsonb_build_object('title', draft_title, 'intro', draft_intro, 'effectiveDate', draft_effective_date,
    'updatedDate', '', 'body', draft_body, 'version', draft_version_label, 'updateNotes', draft_update_notes),
  jsonb_build_object('title', title, 'intro', intro, 'effectiveDate', effective_date,
    'updatedDate', '', 'body', body, 'version', version_label, 'updateNotes', update_notes),
  published_version, published_at
from content_privacy_policy on conflict (content_key) do nothing;

-- An agreement becomes public only after an administrator supplies and publishes it.
insert into content_legal_documents (content_key, draft)
values ('user-agreement', '{"title":{"richText":"用户协议","fontSize":28,"color":"#5c493c"},"intro":{"richText":"","fontSize":16,"color":"#5c493c"},"effectiveDate":"","updatedDate":"","version":"1.0","updateNotes":"","body":{"richText":"","fontSize":14,"color":"#5c493c"}}'::jsonb)
on conflict (content_key) do nothing;

alter table content_privacy_revisions drop constraint if exists content_privacy_revisions_content_key_check;
alter table content_privacy_revisions add constraint content_privacy_revisions_content_key_check
  check (content_key in ('about-page', 'privacy-policy', 'privacy-page', 'user-agreement'));
