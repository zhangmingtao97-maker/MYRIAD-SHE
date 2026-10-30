create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  wechat_openid text not null unique,
  wechat_unionid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  method text not null check (method in ('reality', 'season')),
  status text not null default 'saved' check (status in ('draft', 'saved', 'deleted')),
  issue_code text,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists observations_user_updated_idx on observations(user_id, updated_at desc);

create table if not exists content_issues (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  month text not null,
  theme text not null,
  question text not null,
  micro_voice_title text,
  micro_voice_duration text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_issues_status_updated_idx on content_issues(status, updated_at desc);

insert into content_issues (code, label, month, theme, question, micro_voice_title, micro_voice_duration, status)
values ('issue-02', 'ISSUE 02', 'Sep 2026', '手指一根一根松开', '最近，有什么是你已经不想再握紧的？', '微声音 01', '01:12', 'published')
on conflict (code) do nothing;
