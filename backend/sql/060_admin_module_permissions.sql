-- 员工模块授权：null 表示跟随角色默认授权，'{}' 表示显式不授权任何模块。
alter table admin_accounts
  add column if not exists module_permissions text[];

comment on column admin_accounts.module_permissions is '后台模块授权覆盖；null=跟随角色默认，空数组=不授权任何模块';
