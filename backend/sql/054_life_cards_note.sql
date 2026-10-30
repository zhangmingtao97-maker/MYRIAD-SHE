-- 生命牌新增「传统线索 · 注」字段：按花色与点数生成初始文案，运营可在后台逐日改写。

alter table content_life_cards add column if not exists note text not null default '';

update content_life_cards set note = '本书以'
  || (case suit when 'spade' then '黑桃' when 'heart' then '红桃' when 'club' then '梅花' else '方块' end)
  || '读'
  || (case suit when 'spade' then '工作、身体与生活经验' when 'heart' then '爱、关系与情绪' when 'club' then '沟通、学习与日常秩序' else '金钱、价值与安全感' end)
  || '；' || rank || ' 的象征线索涉及'
  || (case rank
        when 'A' then '独立的开始' when '2' then '关系与合作' when '3' then '表达与创造'
        when '4' then '结构与稳定' when '5' then '变化与行动' when '6' then '责任与照顾'
        when '7' then '反思与内在功课' when '8' then '权力与资源' when '9' then '收束与完成'
        when '10' then '周期与成果' when 'J' then '学习与新的视角' when 'Q' then '涵容与滋养'
        else '承担与主导' end)
  || '。这里按数字与花色选取主题。'
where note = '';
