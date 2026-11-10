-- Allow one reader to reply to multiple floors in the same discussion thread.
alter table discussion_contributions
  drop constraint if exists discussion_contributions_user_id_issue_code_thread_id_key;

create unique index if not exists discussion_contributions_user_issue_root_uidx
  on discussion_contributions (user_id, issue_code)
  where thread_id = '';

create unique index if not exists discussion_contributions_user_reply_target_uidx
  on discussion_contributions (user_id, issue_code, thread_id, parent_contribution_id)
  where thread_id <> '' and parent_contribution_id is not null;

create unique index if not exists discussion_contributions_user_reply_untargeted_uidx
  on discussion_contributions (user_id, issue_code, thread_id)
  where thread_id <> '' and parent_contribution_id is null;
