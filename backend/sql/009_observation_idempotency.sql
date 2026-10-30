alter table observations add column if not exists client_draft_id text;

create unique index if not exists observations_user_client_draft_idx
  on observations(user_id, client_draft_id)
  where client_draft_id is not null;
