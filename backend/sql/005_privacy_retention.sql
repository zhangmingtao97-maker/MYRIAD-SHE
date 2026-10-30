alter table privacy_requests alter column user_id drop not null;

alter table privacy_requests
  drop constraint if exists privacy_requests_user_id_fkey;

alter table privacy_requests
  add constraint privacy_requests_user_id_fkey
  foreign key (user_id) references users(id) on delete set null;
