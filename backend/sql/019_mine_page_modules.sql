alter table content_mine_page
  add column if not exists discussion_heading text not null default '我参与的讨论'
    check (char_length(discussion_heading) between 1 and 60),
  add column if not exists discussion_count text not null default '0条本机发言'
    check (char_length(discussion_count) between 1 and 60),
  add column if not exists discussion_empty_action text not null default '还没有留下发言'
    check (char_length(discussion_empty_action) between 1 and 100),
  add column if not exists discussion_intro text not null default '本期讨论独立于个人观察。示例装载的发言不会计入你的参与。'
    check (char_length(discussion_intro) between 1 and 240),
  add column if not exists practice_heading text not null default '线下实践'
    check (char_length(practice_heading) between 1 and 60),
  add column if not exists practice_count text not null default '0 次'
    check (char_length(practice_count) between 1 and 60),
  add column if not exists practice_empty_title text not null default '尚未参加共同实践'
    check (char_length(practice_empty_title) between 1 and 100),
  add column if not exists practice_intro text not null default '活动开放并真实参与后，会记录在这里。'
    check (char_length(practice_intro) between 1 and 240),
  add column if not exists privacy_heading text not null default '选择与隐私'
    check (char_length(privacy_heading) between 1 and 60),
  add column if not exists privacy_action text not null default '通知与隐私'
    check (char_length(privacy_action) between 1 and 60);
