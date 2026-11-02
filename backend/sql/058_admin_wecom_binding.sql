alter table admin_accounts
  add column if not exists wecom_user_id text;

create unique index if not exists admin_accounts_wecom_user_id_uq
  on admin_accounts (wecom_user_id)
  where wecom_user_id is not null;
