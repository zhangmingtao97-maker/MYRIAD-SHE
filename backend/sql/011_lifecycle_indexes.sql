create index if not exists observations_status_updated_idx
  on observations(status, updated_at desc);

create index if not exists audit_logs_created_id_idx
  on audit_logs(created_at desc, id desc);

create index if not exists privacy_requests_requested_id_idx
  on privacy_requests(requested_at desc, id desc);
