-- 释义来源与使用说明改为「每天一条」，由后台维护。
-- 初始值按现有静态文案播种，其中「数字 N」随牌面替换。

alter table content_life_cards add column if not exists source_note text not null default '';

update content_life_cards set source_note =
  'Robert Camp，Love Cards: What Your Birthday Reveals About You & Your Personal Relationships，Sourcebooks，1997. ISBN 1-57071-145-3。' || chr(10) || chr(10) ||
  '数字 ' || rank || '：印刷第 47 页；花色：The Nature of the Four Suits，印刷第 331–335 页。这里参考数字与花色章节，不作为该张牌的完整传统释义。' || chr(10) || chr(10) ||
  '生日对应依据本书封底内页的生日表；2 月 29 日对应 9♣，12 月 31 日对应 Joker。' || chr(10) || chr(10) ||
  '传统注解为主题节选，非完整译文。底色描述与提问由 MYRIAD SHE 编写，仍在持续修订，不沿用原书的命运预测或健康归因。出处说明符号来自哪里，不证明生日能够决定人格。'
where source_note = '';
