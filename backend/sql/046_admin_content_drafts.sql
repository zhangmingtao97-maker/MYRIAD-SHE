create table if not exists admin_content_drafts (
  content_key text primary key check (content_key in ('practice', 'daily-objects')),
  content jsonb not null,
  edit_version integer not null check (edit_version > 0),
  updated_by text,
  updated_at timestamptz not null default now()
);
