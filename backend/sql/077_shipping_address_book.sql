alter table users add column shipping_address_revision integer not null default 0 check (shipping_address_revision >= 0);

create table user_shipping_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  address_encrypted jsonb not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index user_shipping_addresses_user on user_shipping_addresses(user_id, created_at, id);
create unique index user_shipping_addresses_default on user_shipping_addresses(user_id) where is_default;

-- Preserve the existing encrypted address without decrypting personal data in SQL.
insert into user_shipping_addresses(user_id, address_encrypted, is_default)
select id, shipping_address_encrypted, true from users where shipping_address_encrypted is not null;
