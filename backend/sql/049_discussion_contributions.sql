create table if not exists discussion_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  issue_code text not null,
  issue_label_snapshot text not null,
  thread_id text not null default '',
  thread_author_snapshot text,
  body jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'handled', 'dismissed')),
  revision integer not null default 1 check (revision > 0),
  handled_by text,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, issue_code, thread_id)
);

create index if not exists discussion_contributions_status_updated_idx
  on discussion_contributions(status, updated_at desc, id desc);

create index if not exists discussion_contributions_user_updated_idx
  on discussion_contributions(user_id, updated_at desc);

do $$
declare
  current_policy content_privacy_policy%rowtype;
  updated_body jsonb;
  updated_version integer;
  updated_notes text := '增加讨论经历的云端保存与审核说明。';
  updated_effective_date text := '最后更新：2026 年 10 月 23 日';
  updated_rich_text text := '<p><strong>我们收集什么</strong></p><p>我们收集提供观察、账户登录与服务支持所需的信息，以及你主动保存到云端的讨论经历。</p><p><strong>信息如何使用</strong></p><p>你的观察记录默认私密，仅用于云端保存、同步与数据导出。</p><p><strong>讨论经历</strong></p><p>你点击保存后，经历正文会加密保存在账户中，并供有权限的运营编辑人员查看和处理；内容不会自动公开。你可以在“我的”页面删除已保存经历；申请删除账户时，这些经历会一并删除。</p><p><strong>你的选择</strong></p><p>你可以关闭提醒和方法偏好，也可以导出或申请删除账户数据。</p><p><strong>联系我们</strong></p><p>如果你对隐私处理有疑问，可以通过后台配置的联系方式与我们联系。</p>';
begin
  select * into current_policy from content_privacy_policy where id = 1 for update;
  if found
    and current_policy.body->>'richText' = '<p><strong>我们收集什么</strong></p><p>我们只收集提供观察、账户登录和服务支持所必需的信息。</p><p><strong>信息如何使用</strong></p><p>你的观察记录默认私密，仅用于为你提供云端保存、同步和数据导出服务。</p><p><strong>你的选择</strong></p><p>你可以关闭提醒和方法偏好，也可以导出或申请删除账户数据。</p><p><strong>联系我们</strong></p><p>如果你对隐私处理有疑问，可以通过后台配置的联系方式与我们联系。</p>'
    and current_policy.draft_body->>'richText' = current_policy.body->>'richText'
  then
    updated_body := jsonb_set(current_policy.body, '{richText}', to_jsonb(updated_rich_text), false);
    updated_version := current_policy.published_version + 1;
    update content_privacy_policy
    set body = updated_body,
        draft_body = updated_body,
        effective_date = updated_effective_date,
        draft_effective_date = updated_effective_date,
        version_label = '1.1',
        draft_version_label = '1.1',
        update_notes = updated_notes,
        draft_update_notes = updated_notes,
        edit_version = edit_version + 1,
        published_version = updated_version,
        published_at = now(),
        updated_at = now()
    where id = 1;
    insert into content_privacy_revisions (content_key, version, content)
    values ('privacy-policy', updated_version, jsonb_build_object(
      'title', current_policy.title,
      'intro', current_policy.intro,
      'effectiveDate', updated_effective_date,
      'version', '1.1',
      'updateNotes', updated_notes,
      'body', updated_body
    ))
    on conflict (content_key, version) do nothing;
  end if;
end
$$;
