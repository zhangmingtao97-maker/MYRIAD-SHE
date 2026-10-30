update content_privacy_page
set copy = jsonb_set(
  jsonb_set(
    jsonb_set(copy, '{localCopy}', '{"richText":"清除本机登录状态和临时数据；云端观察记录及账户数据将保留。","fontSize":12,"color":"#5c493c"}'::jsonb),
    '{localAction}', '{"richText":"清除本地登录状态","fontSize":15,"color":"#663124"}'::jsonb
  ),
  '{localConfirm}', '{"richText":"确定清除这台设备上的登录状态和临时数据吗？云端记录不会删除。","fontSize":12,"color":"#5c493c"}'::jsonb
),
updated_at = now()
where id = 1
  and copy #>> '{localAction,richText}' = '清除全部观察记录';
