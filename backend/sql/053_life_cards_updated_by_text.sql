-- 管理端身份可能是 `admin:admin` 这类非 UUID 的部署账号（与 audit_logs.actor_id 一致为 text），
-- 052 把 updated_by 建成了 uuid，写入非 UUID 身份时会报类型错误。此处改为 text。

alter table content_life_cards alter column updated_by type text using updated_by::text;
