# 收货地址模块（本地实施）

入口：个人资料 → 收货地址。页面 `miniprogram/pages/addresses/index` 包含地址列表、新增／编辑、保存成功三种状态，使用原生地区选择器，支持手动填写与可选的微信导入。首个地址自动设为默认，最多保存 10 个。保存失败保留填写内容；检测到版本冲突时，重新读取后可继续保存草稿。离开未保存的表单前会确认。

界面沿用米色背景、象牙色卡片、砖红色按钮和宋体排版，底部操作适配安全区。列表和成功页隐藏手机号中间四位，编辑时显示完整电话；地址只在当前页面内存中保存，不写入小程序本地缓存。

## 本地运行

当前 `miniprogram/utils/env.ts` 使用 `dev`，模拟器请求 `http://127.0.0.1:61021/api`。本地 API 容器启动后自动执行 `backend/sql/077_shipping_address_book.sql`，迁移旧地址的密文并保留默认地址。手机预览时需要将开发地址改为手机可访问的电脑局域网地址；发布前将 `ENV` 切回 `prod`，并先部署支持新接口的后端。

地址 API 使用现有用户登录鉴权，所有响应禁止缓存：

| 操作 | 请求 |
| --- | --- |
| 列表 | `GET /me/addresses` |
| 新增 | `POST /me/addresses` |
| 编辑 | `PATCH /me/addresses/:id` |
| 设为默认 | `PATCH /me/addresses/:id/default` |
| 删除 | `DELETE /me/addresses/:id` |

写操作携带列表返回的 `version`；新增／编辑还携带八字段 `address` 和布尔值 `isDefault`。服务端加锁并检查版本，过期返回 409。地址独立加密保存，默认地址同步原 `users.shipping_address_encrypted` 字段，兼容旧版资料接口与管理端。用户数据导出包含全部保存地址，删除账户会级联删除地址；审计不包含地址、姓名或电话。

微信导入仍依赖公众平台声明，见 [微信收货地址配置](wechat-address-configuration.md)。平台配置缺失不会影响手动保存。

## 验证

```powershell
npm --prefix backend run build
npm --prefix backend run test:unit
docker exec -e RUN_ADDRESS_DB_TESTS=1 myriad_she_api node --test test/shipping-address.postgres.cjs
```

数据库测试使用临时用户，结束后回滚全部数据。覆盖鉴权、跨账户访问、严格字段校验、版本冲突、地址上限、默认切换、旧版兼容、密文存储和账户删除。小程序测试覆盖表单校验、防重复提交、失败保留草稿、冲突重载、删除确认、微信导入错误和账户切换后的迟到回调。

模拟器截图位于 `.codex-artifacts/address-validation/`：前五张使用虚构地址和模拟响应；`06-local-save.png` 为模拟器通过本地真实 API 保存地址后的结果。已验证重新读取后的持久化结果，并清理联调账户、测试地址和相关审计记录。
