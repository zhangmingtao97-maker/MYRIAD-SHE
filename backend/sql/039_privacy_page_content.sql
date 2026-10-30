create table if not exists content_privacy_page (
  id smallint primary key check (id = 1),
  edit_version integer not null default 1 check (edit_version > 0),
  copy jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into content_privacy_page (id, copy)
values (
  1,
  '{
    "topbarTitle":{"richText":"通知与隐私","fontSize":16,"color":"#5c493c"},
    "metaLeft":{"richText":"我的","fontSize":12,"color":"#8b6b58"},
    "metaRight":{"richText":"PRIVACY &amp; CHOICES","fontSize":12,"color":"#663124"},
    "heroTitle":{"richText":"方法应当由你使用，<br/>而不是反过来定义你。","fontSize":28,"color":"#5c493c"},
    "heroIntro":{"richText":"隐私与方法偏好始终由你决定。","fontSize":16,"color":"#5c493c"},
    "privacyNumber":{"richText":"01","fontSize":11,"color":"#8b6b58"},
    "privacyLabel":{"richText":"隐私","fontSize":11,"color":"#8b6b58"},
    "privacyTitle":{"richText":"观察记录默认私密","fontSize":15,"color":"#5c493c"},
    "privacyCopy":{"richText":"只保存在这台设备上，不自动公开或分享","fontSize":12,"color":"#5c493c"},
    "privacyStatus":{"richText":"已开启","fontSize":12,"color":"#663124"},
    "methodNumber":{"richText":"02","fontSize":11,"color":"#8b6b58"},
    "methodLabel":{"richText":"方法选择","fontSize":11,"color":"#8b6b58"},
    "methodTitle":{"richText":"暂不使用四时气韵","fontSize":15,"color":"#5c493c"},
    "methodCopy":{"richText":"你可以随时重新开启这一种观察方式","fontSize":12,"color":"#5c493c"},
    "methodAction":{"richText":"使用四时气韵","fontSize":12,"color":"#8b6b58"},
    "reminderNumber":{"richText":"03","fontSize":11,"color":"#8b6b58"},
    "reminderLabel":{"richText":"提醒与关于","fontSize":11,"color":"#8b6b58"},
    "reminderTitle":{"richText":"活动提醒","fontSize":15,"color":"#5c493c"},
    "reminderCopy":{"richText":"共同实践开放时再向你询问","fontSize":12,"color":"#5c493c"},
    "reminderAction":{"richText":"→","fontSize":16,"color":"#663124"},
    "aboutTitle":{"richText":"关于 MYRIAD SHE","fontSize":15,"color":"#5c493c"},
    "aboutCopy":{"richText":"品牌、内容来源与联系方式","fontSize":12,"color":"#5c493c"},
    "aboutAction":{"richText":"→","fontSize":16,"color":"#663124"},
    "localLabel":{"richText":"本地数据","fontSize":11,"color":"#8b6b58"},
    "localTitle":{"richText":"清除只影响这台设备，且无法恢复。","fontSize":15,"color":"#5c493c"},
    "localCopy":{"richText":"云端观察记录和账户数据不会因此删除。","fontSize":12,"color":"#5c493c"},
    "localAction":{"richText":"清除全部观察记录","fontSize":15,"color":"#663124"},
    "localConfirm":{"richText":"确定清除这台设备上的登录状态和临时数据吗？","fontSize":12,"color":"#5c493c"},
    "footerCopy":{"richText":"停用四时气韵不会自动删除历史记录。是否保留，由你决定。","fontSize":12,"color":"#5c493c"},
    "policyTitle":{"richText":"隐私政策","fontSize":15,"color":"#5c493c"},
    "policyCopy":{"richText":"了解我们如何处理信息","fontSize":12,"color":"#5c493c"}
  }'::jsonb
)
on conflict (id) do nothing;
