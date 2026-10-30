-- 生命牌文案：按公历月/日，每天一条（含 2 月 29 日，共 366 条）。
-- 牌面按「1 月 1 日 = 4♠」起，花色顺序 ♠♥♣♦、点数顺序 4..K A 2 3 循环，
-- 该规则使 1 月 12 日对应 2♠，与设计稿一致；运营可在后台逐日修正牌面与文案。

create table if not exists content_life_cards (
  month smallint not null check (month between 1 and 12),
  day smallint not null check (day between 1 and 31),
  suit text not null check (suit in ('spade', 'heart', 'club', 'diamond')),
  rank text not null,
  theme text not null default '',
  title text not null default '',
  summary text not null default '',
  prompt text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (month, day)
);

insert into content_life_cards (month, day, suit, rank, theme, title, summary, prompt)
select
  m.month,
  d.day,
  (array['spade', 'heart', 'club', 'diamond'])[((coalesce(m.cumulative, 0) + d.day - 1) % 52) / 13 + 1],
  (array['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '3'])[((coalesce(m.cumulative, 0) + d.day - 1) % 52) % 13 + 1],
  '日常与行动',
  '在靠近中，听见自己',
  '与人相处既有靠近，也有差异。可以留意一次协商中，哪些话已经说出，哪些需要还没有被听见。',
  '从日常安排、身体感受或反复的动作里，你注意到了什么？'
from (
  select month, sum(days) over (order by month rows between unbounded preceding and 1 preceding) as cumulative
  from (
    select 1 as month, 31 as days union all select 2, 29 union all select 3, 31 union all select 4, 30
    union all select 5, 31 union all select 6, 30 union all select 7, 31 union all select 8, 31
    union all select 9, 30 union all select 10, 31 union all select 11, 30 union all select 12, 31
  ) as raw
) as m
cross join lateral (
  select generate_series(1, case
    when m.month = 2 then 29
    when m.month in (4, 6, 9, 11) then 30
    else 31
  end) as day
) as d
on conflict (month, day) do nothing;
