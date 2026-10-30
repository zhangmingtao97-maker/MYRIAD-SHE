alter table content_practice_page
  add column if not exists observation_copy jsonb not null default '{
    "metaLeft": {"richText": "此刻归安", "fontSize": 12, "color": "#8b6b58"},
    "metaRight": {"richText": "PRIVATE PRACTICE", "fontSize": 12, "color": "#663124"},
    "introTitle": {"richText": "先把正在发生的事，放在眼前。", "fontSize": 28, "color": "#663124"},
    "introDescription": {"richText": "辨认感受、关系，以及此刻可以迈出的一步。两种路径都只提供观察，不替你作判断。", "fontSize": 14, "color": "#40362f"},
    "realityContext": {"richText": "从经验出发", "fontSize": 12, "color": "#8b6b58"},
    "realityTitle": {"richText": "从现实处境开始", "fontSize": 22, "color": "#663124"},
    "realityDescription": {"richText": "沿着正在发生的事，理清感受、需要，以及此刻真正能做的一步。", "fontSize": 14, "color": "#40362f"},
    "realityAction": {"richText": "开始观察", "fontSize": 14, "color": "#663124"},
    "seasonContext": {"richText": "换一个观察角度", "fontSize": 12, "color": "#8b6b58"},
    "seasonTitle": {"richText": "从四时气韵开始", "fontSize": 22, "color": "#663124"},
    "seasonDescription": {"richText": "从生日对应的生命牌出发，回看真实经验，辨认一件事中的变化与自己的选择。", "fontSize": 14, "color": "#40362f"},
    "seasonGuide": {"richText": "先了解四时气韵是什么", "fontSize": 13, "color": "#663124"},
    "seasonAction": {"richText": "了解方法并开始", "fontSize": 14, "color": "#663124"},
    "privacyLabel": {"richText": "仅自己可见", "fontSize": 13, "color": "#663124"},
    "privacyCopy": {"richText": "所有观察默认私密。你可以修改、删除或随时停止。", "fontSize": 12, "color": "#76695f"}
  }'::jsonb;
