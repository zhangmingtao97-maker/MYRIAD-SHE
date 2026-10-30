alter table admin_accounts
  add column if not exists password_change_required boolean not null default false;
