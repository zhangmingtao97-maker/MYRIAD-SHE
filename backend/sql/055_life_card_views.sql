-- 生命牌查看记录：用户每次在「四时气韵 · 底色」查看自己的生命牌时留存一条，供后台查阅。

create table if not exists life_card_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  month smallint not null check (month between 1 and 12),
  day smallint not null check (day between 1 and 31),
  suit text not null,
  rank text not null,
  viewed_at timestamptz not null default now()
);

create index if not exists life_card_views_viewed_at_idx on life_card_views (viewed_at desc);
create index if not exists life_card_views_user_idx on life_card_views (user_id, viewed_at desc);
