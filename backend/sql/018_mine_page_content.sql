create table if not exists content_mine_page (
  id smallint primary key check (id = 1),
  edit_version integer not null default 1 check (edit_version > 0),
  title text not null check (char_length(title) between 1 and 100),
  intro text not null check (char_length(intro) between 1 and 240),
  observation_heading text not null check (char_length(observation_heading) between 1 and 60),
  empty_title text not null check (char_length(empty_title) between 1 and 100),
  empty_intro text not null check (char_length(empty_intro) between 1 and 240),
  start_button text not null check (char_length(start_button) between 1 and 60),
  updated_at timestamptz not null default now()
);

insert into content_mine_page (id, title, intro, observation_heading, empty_title, empty_intro, start_button)
values (
  1,
  '把正在经历的，留在自己这里。',
  '观察记录保存在你的云端账户。讨论中的发言由你另行选择，个人观察不会自动公开。',
  '我的观察',
  '还没有观察记录。',
  '从一件真实发生的事开始，或借四时气韵换一个角度。',
  '开始第一次观察'
)
on conflict (id) do nothing;
