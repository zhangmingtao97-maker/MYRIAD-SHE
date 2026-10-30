create table if not exists content_privacy_policy (
  id smallint primary key check (id = 1),
  edit_version integer not null default 1 check (edit_version > 0),
  title jsonb not null,
  intro jsonb not null,
  effective_date text not null check (char_length(effective_date) between 1 and 80),
  body jsonb not null,
  updated_at timestamptz not null default now()
);

insert into content_privacy_policy (id, title, intro, effective_date, body)
values (
  1,
  '{"richText":"隐私政策","fontSize":28,"color":"#5c493c"}'::jsonb,
  '{"richText":"我们希望你清楚知道，信息如何被使用，以及你可以如何选择。","fontSize":16,"color":"#5c493c"}'::jsonb,
  '最后更新：2026 年 10 月 20 日',
  '{"richText":"<p><strong>我们收集什么</strong></p><p>我们只收集提供观察、账户登录和服务支持所必需的信息。</p><p><strong>信息如何使用</strong></p><p>你的观察记录默认私密，仅用于为你提供云端保存、同步和数据导出服务。</p><p><strong>你的选择</strong></p><p>你可以关闭提醒和方法偏好，也可以导出或申请删除账户数据。</p><p><strong>联系我们</strong></p><p>如果你对隐私处理有疑问，可以通过后台配置的联系方式与我们联系。</p>","fontSize":14,"color":"#5c493c"}'::jsonb
)
on conflict (id) do nothing;
