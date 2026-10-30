alter table users add column if not exists status text not null default 'active'
  check (status in ('active', 'suspended'));

create table if not exists admin_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null,
  password_hash text not null,
  role text not null check (role in ('super_admin', 'content_editor', 'support_readonly')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists system_settings (
  key text primary key,
  value jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

insert into system_settings (key, value) values
  ('store_enabled', 'false'::jsonb),
  ('maintenance_notice', '""'::jsonb),
  ('support_contact', '""'::jsonb)
on conflict (key) do nothing;

create index if not exists users_created_id_idx on users(created_at desc, id desc);
create index if not exists admin_accounts_role_status_idx on admin_accounts(role, status);
