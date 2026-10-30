update content_mine_page
set intro = '观察记录保存在你的云端账户上。讨论中的发言由你另行选择，个人观察不会自动公开。',
    edit_version = edit_version + 1,
    updated_at = now()
where id = 1
  and intro = '观察记录保存在你的云端账户。讨论中的发言由你另行选择，个人观察不会自动公开。';
