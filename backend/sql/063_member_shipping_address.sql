-- 会员收货地址：仅保存用户主动通过微信收货地址授权提交的内容。
-- 地址以应用层加密后的 JSONB 存储，管理后台仅超级管理员可解密查看。
alter table users add column if not exists shipping_address_encrypted jsonb;
