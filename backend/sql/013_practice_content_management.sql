create table if not exists content_practice_page (
  id smallint primary key check (id = 1),
  title text not null check (char_length(title) between 1 and 80),
  intro text not null check (char_length(intro) between 1 and 240),
  updated_at timestamptz not null default now()
);

insert into content_practice_page (id, title, intro)
values (1, '实践', '先回到能承接真实经验的位置。')
on conflict (id) do nothing;

create table if not exists content_practice_entries (
  key text primary key check (key in ('observation', 'shared-practice', 'daily-goods')),
  title text not null check (char_length(title) between 1 and 80),
  description text not null check (char_length(description) between 1 and 240),
  enabled boolean not null default false,
  sort_order smallint not null unique check (sort_order >= 0),
  updated_at timestamptz not null default now(),
  constraint content_practice_observation_enabled check (key <> 'observation' or enabled),
  constraint content_practice_shared_disabled check (key <> 'shared-practice' or not enabled),
  constraint content_practice_daily_goods_disabled check (key <> 'daily-goods' or not enabled)
);

insert into content_practice_entries (key, title, description, enabled, sort_order)
values
  ('observation', '此刻观察', '从现实处境开始，也可以从四时气韵开始', true, 10),
  ('shared-practice', '共同实践', '有真实活动时才开放', false, 20),
  ('daily-goods', '日常之物', '正在研究·尚未开放', false, 30)
on conflict (key) do nothing;
