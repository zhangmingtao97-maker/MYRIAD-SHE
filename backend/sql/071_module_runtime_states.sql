-- 模块运行状态机：为后台提供统一的模块状态观察、人工维护与变更时间线。
create table if not exists module_runtime_states (
  module_id text primary key,
  label text not null,
  category text not null,
  state text not null default 'online'
    check (state in ('online', 'maintenance', 'degraded', 'disabled')),
  previous_state text
    check (previous_state is null or previous_state in ('online', 'maintenance', 'degraded', 'disabled')),
  reason text,
  updated_by text,
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz
);

create table if not exists module_state_events (
  id uuid primary key default gen_random_uuid(),
  module_id text not null references module_runtime_states(module_id) on delete cascade,
  previous_state text
    check (previous_state is null or previous_state in ('online', 'maintenance', 'degraded', 'disabled')),
  next_state text not null
    check (next_state in ('online', 'maintenance', 'degraded', 'disabled')),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  actor_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists module_state_events_module_created_idx
  on module_state_events (module_id, created_at desc, id desc);

create index if not exists module_state_events_created_idx
  on module_state_events (created_at desc, id desc);

-- 只更新展示元数据，不覆盖已经维护的运行状态。
insert into module_runtime_states (module_id, label, category) values
  ('miniprogram-api', '小程序 API', '应用入口'),
  ('content', '内容与期刊', '内容'),
  ('practice', '实践页面', '内容'),
  ('community', '社区与讨论', '用户'),
  ('shop', '日常之物', '业务'),
  ('observations', '此刻观察', '业务'),
  ('discussions', '讨论投稿与举报', '内容'),
  ('object-storage', '对象存储', '基础设施'),
  ('database', '数据库', '基础设施'),
  ('notifications', '通知与提醒', '基础设施')
on conflict (module_id) do update
set label = excluded.label,
    category = excluded.category;
