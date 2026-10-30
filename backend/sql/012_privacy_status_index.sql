create index if not exists privacy_requests_status_requested_id_idx
  on privacy_requests(status, requested_at desc, id desc);
