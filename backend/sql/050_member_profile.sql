alter table users add column if not exists nickname varchar(32);
alter table users add column if not exists avatar_object_key text;
alter table users add column if not exists phone_encrypted jsonb;
alter table users add column if not exists phone_last4 char(4);
alter table users add column if not exists phone_verified_at timestamptz;

create index if not exists users_nickname_idx on users (lower(nickname)) where nickname is not null;
