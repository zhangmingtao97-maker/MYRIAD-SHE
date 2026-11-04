# MYRIAD SHE 开发进度

## 2026-11-04 共同实践预览接入「按期文案」

- `CopyPagePreview` 新增可选 `extraSections`：在全局字段之后追加任意分组，每块带独立 key，编号自动接在全局字段之后。
- 共同实践选中期刊后，预览末尾会多出「线上 · 讨论说明段落（期号）」与「线下活动说明条目（期号）」两组：段落按条列出（段落 1、段落 2…），线下条目显示 `第 N 项 · 条目标题`，正文取各自的说明文案，字号与颜色用该字段自身的值。
- 右侧按期文案面板的每一行（段落、条目卡片）都挂了 `data-copy-field="paragraph:<i>"` / `"rule:<i>"`，所以点预览里的段落/条目会滚到对应编辑行并闪框，点编辑行时预览同步高亮——和全局字段用的是同一套定位。
- 预览标题在选定期刊后会变成「共同实践 · 按期」，副标题显示期号，避免误以为是全局文案。
- 验证：Playwright 实测 —— 选 `ISSUE 02 · issue-02` 后预览区块从 31 个增加到 36 个（2 段 + 4 条），点「第 1 项 · 为什么相见」右侧对应条目卡片闪框并高亮。
- 已发布（重建 admin 容器，备份 `management-src-pre-preview-2-20261104-144751.tar.gz`），线上 bundle 含 `copy-preview-group--extra`。

## 2026-11-04 后台手机预览补齐：我的页面、此刻观察、共同实践

- 我的页面（`MinePagePreview.vue`）：预览顶部「MYRIAD SHE / MINE / 我的」→ 账户卡片占位 → 主标题与说明 → 01 我的观察（空状态 + 按钮）→ 02 参与的讨论 → 03 线下实践 → 04 选择与隐私，五个区块分别对应右侧五个页签。点区块会自动切到那个页签、滚到面板并闪框；在任意面板里点进输入框，左侧同步高亮。
- 此刻观察（`CopyPagePreview.vue`，通用文案页预览）：按「页眉与主说明 / 现实处境路径 / 四时气韵路径 / 隐私说明」四组、15 个字段渲染，每一项是一个可点区块，字号颜色直接取字段自身的 `fontSize` / `color`（按 0.55 缩放贴合手机比例），空字段显示「（空）」。点区块 → 滚到右侧对应的 textarea；点 textarea → 高亮对应区块。
- 共同实践目录：同一套 `CopyPagePreview`，用全局默认文案（`sharedPracticeCopy`）渲染 31 个区块；右侧每个全局字段包在 `.copy-field` 里挂 `data-copy-field`，双向定位与此刻观察一致。按期文案面板保持原样（不改动按期编辑流程）。
- 布局与交互都沿用同一套约定：`.preview-layout` / `.preview-rail` / `.preview-hint` + `data-preview-key` / `.is-preview-active` / `.is-locating`，预览块点击有 hover 底色与红框。
- 验证：`vue-tsc + vite build` 通过；Playwright 实测 —— 我的页面 5 个区块（点「参与的讨论」切页签并闪框、点输入框反向高亮）、此刻观察 15 个区块、共同实践 31 个区块，双向定位均正常。
- 已发布（仅重建 admin 容器，备份 `management-src-pre-preview-2-20261104-142812.tar.gz`），线上 bundle 含 `mine-phone-preview` / `copy-phone-preview` / `daily-phone-preview` / `about-phone-preview`。
- 至此后台内容类页面都有常驻手机预览：期刊首页、实践页面/目录、此刻观察、共同实践、日常之物、我的页面、关于 MYRIAD SHE；用户协议与隐私政策沿用各自的草稿预览窗口。

## 2026-11-04 后台手机预览扩到实践、日常之物、关于页

- 实践页（`PracticePagePreview.vue`）：左边常驻手机预览，按小程序实践页的顺序渲染「页眉 / 页面标题 / 页面说明 / 实践目录 + 每条目录（情境、名称、说明、箭头）」，没有开放的目录半透明并标「未开放」。点预览里的页眉、标题、说明会滚到右侧对应输入框并闪框；点某条目录会直接切到「实践目录设置」、展开那一条并定位。右侧点进任意字段，左侧同步高亮。
- 日常之物（`DailyObjectsPreview.vue`）：预览品牌行（品牌英文/中文 + 购物袋）、首屏文案（眉题/标题/说明）、预览说明与支持文字、商品卡片（图片、英文标识、名称、详情、价格与价格说明），下架商品半透明标「已下架」。左侧字段用 `daily-field`（`display: contents`，不打乱两列栅格）挂 `data-daily-field`，商品卡片挂 `data-daily-field="product:<id>"`，两侧互点互跳。
- 关于 MYRIAD SHE（`AboutPagePreview.vue`）：把原来的文字版草稿预览换成手机版，三段（品牌介绍 / 内容来源 / 联系方式）各自可点，点段落定位到左侧输入框，点输入框高亮对应段落。
- 交互约定统一成一套：预览块 `data-preview-key` + `.preview-block` / `.is-preview-active` / `.is-preview-off`，编辑区 `data-practice-field` / `data-daily-field` / `data-page-field`，右栏定位后加 `.is-locating` 闪一次红框；布局统一用 `admin-preview.css` 里的 `.preview-layout` / `.preview-rail` / `.preview-hint`（期刊那几个 `journal-preview-*` 类名保留为别名）。
- 验证：`vue-tsc + vite build` 通过；Playwright 实测 —— 实践页 7 个区块、点「此刻观察」目录自动切到「实践目录设置」并展开该条；日常之物 5 个区块、点商品卡片右侧对应商品卡片闪框；关于页 3 个区块、点「内容来源」左侧输入框闪框。
- 已发布（仅重建 admin 容器，备份 `management-src-pre-preview-2-20261104-142014.tar.gz`），线上 bundle 含 `practice-phone-preview` / `daily-phone-preview` / `about-phone-preview`。
- 待接：我的页面设置、此刻观察、共同实践目录（用户协议/隐私政策已有独立的草稿预览，不在这里接）。

## 2026-11-04 后台「手机预览 + 双向定位」：期刊首页先上线

- 目标：后台编辑内容时，左边常驻一个手机预览，点预览里的区块就知道在改哪里，反过来在右边点字段预览也跟着高亮（对标商城后台那种「左预览右配置」）。
- 做法：新增 `management/src/components/JournalHomePreview.vue` —— 把原来藏在 `<details>` 里的首页草稿预览抽成组件，复用 `style.css` 里已有的 `.issue-phone-preview` / `.preview-*` 版式，按栏目顺序渲染封面、人物、微声音、本期问题、目录、策展档案、品牌页尾，只有被隐藏的栏目半透明并标「已隐藏」。
- 双向定位：每个预览区块带 `data-preview-key`，点它会把右侧切到该栏目、把栏目卡片滚进视野并闪一次红框（`focusIssueModule`）；在右侧栏目卡片里点任意输入框（`@focusin="focusModuleFromEditor"`），左侧预览同步高亮并滚到对应区块。预览区块右上角的小标签显示与右侧「栏目选择器」一致的序号和栏目名，hover 加深、选中变红框。
- 布局：`management/src/admin-preview.css` —— `.journal-preview-layout` 两栏（340px 手机 + 右侧编辑区），预览列 `position: sticky` 常驻；宽度 ≤1080px 时改为上下堆叠，预览限高 420px。
- 覆盖范围：期刊的「首页策展 / 人物故事 / 微声音 / 往期策展」共用这一个预览（「本期讨论」保留它自己的讨论页与写作页预览）。实践、日常之物、页面与协议等编辑页后续按同一套 `data-preview-key` + `is-preview-active` 约定逐个接入。
- 验证：`vue-tsc + vite build` 通过；Playwright 在本地后台实测 —— 预览 8 个区块标签与右侧栏目序号一致，点「微声音」区块后右侧切到 05·微声音 且卡片闪红框，右侧选「本期问题」后左侧高亮 05·本期问题，点右侧输入框左侧同步，预览列 sticky 高度 709px 不超屏。

## 2026-11-04 企业微信扫码可直接建号（超级管理员）

- 现象：曹宇辰扫码报「该企业微信账号未绑定管理后台（UserID: CaoYuChen）」。原因是后台按 `wecom_user_id` 或同名 username 匹配管理员，`CaoYuChen` 两边都没有，也不在 `ADMIN_WECOM_SUPER_ADMIN_USER_IDS` 白名单；审计日志里能查到 10:21:14 的 `admin.auth.login_failed`（`reason: wecom_unbound`）。
- 改动：`adminWecomLogin` 在查不到账号时自动创建 `admin_accounts` —— 角色 `super_admin`、状态 active、`password_change_required = false`；用户名 `wecom_<企业微信账号>`（重名时追加随机后缀），显示名取企业微信通讯录里的姓名（取不到就退回 UserID），密码是随机 32 字节的 scrypt 哈希、没有人知道，因此这种账号只能扫码登录。建号会写一条 `admin.auth.provisioned` 审计，后台「审计日志」显示为「扫码自动创建管理员」。并发扫码由 `wecom_user_id` 唯一索引加回查兜住，不会重复建号。
- 开关：`ADMIN_WECOM_AUTO_PROVISION`（默认开启；填 `0/false/no/off` 关闭，关闭后行为回到「必须先在员工与权限里绑定」）。实际风险面受企业微信应用的「可见范围」约束：只有可见范围内的成员能扫码，扫到就会成为超级管理员；要收回权限可在「员工与权限」里停用该账号，或在企业微信后台缩小可见范围。
- 已绑定账号仍按既有绑定登录、不会重复建号；但如果绑定值和真实 UserID 对不上，就会走到自动建号。张明涛当前绑的是 `d1d755558214dfc6b10def9413a69052`，和企业微信返回的账号（形如 `CaoYuChen`）不一致，建议在「员工与权限」里改成通讯录里的真实账号。
- 验证：新增两个单测（自动建号成功、关闭开关时仍拒绝并记失败），后端 180 项测试全过；后台 `vue-tsc + vite build` 通过；已发布，线上 `/` 200、`/api/health/ready` 200、`/api/auth/admin/wecom/config` 返回 `enabled: true`，api 镜像内含 `ADMIN_WECOM_AUTO_PROVISION` 与 `admin.auth.provisioned`，后台 bundle 含新的审计文案。
- 发布备份：`source-pre-wecom-autoprovision-20261104-102948.tar.gz`。

## 2026-11-04 小程序全站开启分享（好友 + 朋友圈）

- 新增 `miniprogram/utils/share.ts`：`shareCard`（转发给朋友，自动拼接并编码 query）、`shareTimelineCard`（分享到朋友圈，只带 query）、`enableShareMenu`（在 `onLoad` 里开启 `shareAppMessage` / `shareTimeline` 菜单，否则右上角没有「分享到朋友圈」）。
- `app.json` 里 24 个页面全部接入：公共内容页分享自身 —— 首页、实践、四时气韵、日常之物、每日抽取、共同实践、本期讨论、一段对话、写下经历、关于 MYRIAD SHE、协议与说明、往期策展、人物故事、微声音、联系与支持，其中带参数的页面把 `issueCode` / `threadId` / `id` 一并带上（如一段对话分享出去仍指向同一段对话）。
- 私密页面统一分享到首页的品牌文案「MYRIAD SHE｜写给自己的私人档案馆」，避免把观察记录、会员资料、设置等私密内容或登录墙分享给别人：我的、个人资料、登录、设置与隐私、此刻观察、观察记录列表、观察记录详情、通知。
- 校验：脚本确认 24 个页面都含 import、`enableShareMenu()`、`onShareAppMessage`、`onShareTimeline`，TypeScript 转译无语法错误；分享工具用 node 跑过拼 query 的用例（中文与空格会 `encodeURIComponent`，空值被过滤，无参数时不加 `?`）。
- 生效条件：需要在小程序开发者工具里上传并发布新版本后，分享菜单才会在小程序端出现。

## 2026-11-03 后台侧栏点击「卡顿」排查：切页整页淡入是主因

- 测量（dev 后台，Playwright + Event Timing + CPU Profile）：点击侧栏按钮的处理耗时 0–1ms，Event Timing 16–32ms，没有 longtask；即使登录后立刻点击、6 倍 CPU 降速也不到 30ms。JS、布局和接口请求都不是瓶颈（多数栏目切换不发请求，会员列表/用户举报各只发 1 条）。
- 真正原因：每次切换栏目都会重建 `.content-area` 并播放入场动画 —— `.content-area` 是 `view-reveal .38s`（opacity 0→1 + 上移 10px），内部卡片是 `content-rise .42s` 且按 `.045/.09/.135s` 分批延迟，顶栏标题另有 `.28s` 动画（`style.css`、`admin-theme.css`、`admin-journal.css` 三处各有一份，叠加生效）。实测点击后首帧内容 opacity=0，43ms 时只有 37%，最后一批卡片约 555ms 才稳定 —— 视觉上就是「点了一下没反应，然后整页慢慢浮出来」。
- 修复：切页动画改为 `view-fade .09s`（opacity .6→1，不再位移、不再分批延迟），顶栏标题与内容区子卡片取消入场动画，`prefers-reduced-motion` 的分支保持。修复后实测首帧 opacity 0.60，约 94ms 全显，点击即时可读。
- 验证：后台 `vue-tsc + vite build` 通过；线上 bundle `index-spNJaCWx.js` / `index-DqMiaBcS.css` 含 `view-fade`、不再含 `view-reveal`；线上 `/` 200、`/api/health/ready` 200、登录页无控制台报错。
- 发布备份：`source-pre-click-latency-20261103-184053.tar.gz`。本次发布以仓库 HEAD 为准，同时带上了已提交的侧栏分组、协议历史等改动。

## 2026-11-03 后台把「用户举报」拆出经历审核页

- 侧边栏「运营」下新增独立入口「用户举报」，与「用户经历审核」并列；经历审核页不再显示举报区块，两个页面各自只做一件事。
- 权限同步拆分：新增后端模块 `discussion-reports`（`GET /api/admin/discussion-reports`、`PATCH /api/admin/discussion-reports/:id/status`），从 `contributions` 模块移出；`content_editor` 角色默认授权加入该模块，超级管理员自动拥有。线上两个后台账号的 `module_permissions` 都是 `null`（跟随角色默认），因此升级后自动可见；如果之前单独收窄过某人的模块授权，需要到「员工与权限」里手动补勾。
- 页面细节：举报页顶栏标题为「用户举报」，正文只保留待处理数量、「刷新举报」、状态/期刊筛选与举报表格，并写明「这里只处理用户提交的举报；经历与回复留言的审核在『用户经历审核』页面单独处理」；经历审核页保留类型筛选、内容摘要与查看正文。
- 验证：后端 177 项单元测试全过（`admin-auth.guard.spec` 的 content_editor 默认模块断言更新为 6 个模块）；后台 `vue-tsc + vite build` 通过；Playwright 确认侧栏同时出现「用户经历审核」「用户举报」，举报页只有举报表格（0 条待处理 / 全部筛选下 1 条已处理）、经历页只有经历表格且无举报区块；线上 `/` 200、`/api/health/ready` 200，两个管理接口未登录均 401，bundle `index-Bv21UTae.js` 含 `discussion-reports`，样式 `index-CYsuaT5d.css` 含 `reports-toolbar`。
- 发布备份：`source-pre-reports-page-20261103-150416.tar.gz`（回滚需连同源码目录一起回滚后重建 api admin）。小程序不受影响。

## 2026-11-03 后台「用户经历审核」：留言与回复留言直接可见

- 列表接口 `GET /api/admin/discussion-contributions` 增加 `kind` 筛选（`experience` / `reply` / 留空为全部）与 `bodyPreview`：读取时解密正文，压缩空白后截取 80 字返回，列表不再只显示「查看正文」按钮；接口仍不返回完整密文与 `body` 字段，非法 `kind` 返回 400。
- 后台页面新增「类型」筛选（全部 / 经历 / 回复留言），表格改为「期刊 / 类型（经历、回复留言 · 作者）· 内容摘要 · 状态 · 更新时间 · 操作」，详情弹窗的元信息同步改成「回复留言 · 作者」，让运营不用逐个点开就能判断是经历还是对某条讨论的回复，以及内容大意；空态文案改为「当前筛选下没有用户经历或回复留言」。
- 顺带修掉一个导航样式缺陷：侧边栏项是 `<button>`，全局 `button:hover` 会把当前项染成深棕底，而 `.dashboard-tab.active` 的文字也是深棕，悬停时文字与底色相同看不见；补了 `button.dashboard-tab(:hover/.active:hover)` 与 `button.dashboard-subtab:hover` 的高优先级规则。
- 用户操作本身仍记录在「审计日志」：提交/修改走 `discussion_contribution.saved`、删除走 `discussion_contribution.deleted`、举报走 `discussion_report.created`，可在审计日志里按执行者 `user` 与操作名筛选查看。
- 验证：本机 API 10 项断言通过（经历、回复各建一条后 `kind=reply` 仅 1 条、`kind=experience` 仅 1 条、`kind=all` 2 条、非法 kind 400、返回体不含 `body`、摘要解密正确）；后台 Playwright 通过（表头、两行类型与摘要、类型筛选后仅剩回复、详情弹窗元信息与正文、无控制台报错）；发布后线上 `/` 200、`/api/health/ready` 200、`/api/admin/discussion-contributions` 未登录 401，bundle `index-C59-muAq.js` 含「回复留言」「内容摘要」，样式 `index-CAeW3KVb.css` 含导航悬停修正。
- 发布备份：`source-pre-contribution-preview-20261103-144938.tar.gz`（回滚需连同源码目录一起回滚后重建 api admin）。本次只改后端与后台，小程序无需重新上传。

## 2026-11-03 本期讨论举报：改写提示文案并接入运营后台处理

- 小程序「本期讨论」的举报不再只是本机标记：`reportThread` 先弹新文案「举报这条内容 / 举报会连同本期讨论一起提交到运营后台，由编辑团队核实处理；处理过程不会向对方公开你的身份」，确认后选择原因（不适当内容 / 垃圾信息 / 隐私问题 / 其他），再 `POST /discussion/reports` 提交；成功后按钮由「举报」变为「已举报」并 toast「已提交举报」，重复点击提示「这条内容已举报，编辑团队正在核实处理」。举报入口需要登录（`request` 的登录前缀新增 `/discussion/reports`），失败时弹「举报没有提交成功」并保留可重试状态，不再静默写入本机。
- 相关文案同步：右上角「讨论说明」改为说明经历与举报都会进入运营后台；「清除本机发言」补充说明已提交的举报不会被撤回；`utils/discussion-storage.ts` 移除本地 `reports` 字段与 `reportLocalThread`（本机只保留草稿与本机发言），`loadReports()` 通过 `GET /discussion/reports/mine` 恢复「已举报」状态，未登录或网络异常时静默跳过、不影响浏览。
- 后端：迁移 `062_discussion_reports.sql` 新增 `discussion_reports`（issue/thread 快照、reason、detail、status、revision、handled_by/at，`unique (user_id, issue_code, thread_id)`，同一条内容重复举报会 upsert 回 `pending` 并递增 revision）。`DiscussionReportController` 提供 `POST /discussion/reports`（按已发布期刊的讨论内容校验 `threadId`，快照作者与正文，拒绝伪造内容）与 `GET /discussion/reports/mine`；`AdminDiscussionReportController` 提供 `GET /admin/discussion-reports`（状态/期刊筛选、分页、按状态汇总）与 `PATCH /admin/discussion-reports/:id/status`（revision 乐观锁，冲突 409）。举报路由并入既有 `contributions` 模块授权，不新增模块；审计记录 `discussion_report.created`、`discussion_report.status.updated`（只记原因码与期刊，不记正文）。
- 顺带抽出 `discussion/published-discussion.ts#loadPublishedDiscussion`，用户经历与举报共用「已发布期刊讨论内容」读取逻辑（经历行为不变）。
- 后台：「用户经历审核」页新增「用户举报」区块（REPORTED CONTENT）：待处理数量、状态与期刊筛选、分页加载、行内展示被举报作者与正文摘要及补充说明、原因与状态、提交时间，可直接「标记已处理 / 不采纳 / 重新打开」；标题使用独立的 `subsection-heading`，因为页面内 `.section-heading` 会被「隐藏重复标题」规则整块隐藏。
- 验证：后端 `tsc --noEmit` 通过，`test:unit` 177 项 176 通过（唯一失败仍是既有的 `observation.controller` 管理端解密查看案例），新增 5 条举报用例覆盖快照、越权、筛选、乐观锁；本机 API 集成 11 项断言全过（提交 201 / 本人列表 / 不存在内容 400 / 未登录 401 / 队列与汇总 / 处理 200 / 过期版本 409 / 审计动作）；后台 Playwright 11 项断言全过（区块标题、空态、全部筛选出行、作者与原因、重新打开后待处理、标记已处理后已处理、无控制台报错）；小程序改动用 tsc + 轻量垫片检查类型一致。
- 发布：构建时发现生产源码落后于 main（缺 `discussion-page.controller.ts`，`up` 前 `build api` 直接失败），改为整目录同步 `backend/src`、`backend/sql`、`management/src` 后重建 `api admin`，顺带把已上线的讨论页编辑 API 补齐。线上 `061`、`062` 迁移均已应用（`discussion_reports` 15 列），`/api/discussion/reports`、`/api/admin/discussion-reports` 未登录 401，`/` 与 `/api/health/ready` 200，bundle `index-DYOtdilx.js` 含「用户举报」，样式 `index-BkZS-OLQ.css` 含 `subsection-heading`。备份 `source-pre-discussion-reports-20261103-115820.tar.gz`，镜像 `myriad-she-{api,admin}:pre-reports-20261103-115820`（回滚需连同源码目录一起回滚）。
- 待办：小程序端需在微信开发者工具中上传并发布后生效（本次只改了 `miniprogram/pages/discussion/*` 与 `utils/discussion-storage.ts`、`utils/request.ts`）。

### 2026-11-03 本期讨论：「一段对话」独立成页

- 列表页原来的「展开这段对话 / 收起这段对话」改为「查看这段对话 →」，点击 `navigateTo` 到新页 `pages/discussion-thread/index?issueCode=…&threadId=…`；列表不再内联展开回复，也不再显示本机回复，避免同一份对话在两处渲染。
- 新页结构对齐设计稿：顶部「一段对话」，`02 本期讨论 · 一段对话`，标题「从这一段经历，继续谈起。」，导语复用 `content.copy.intro`；正文为所选 thread，作者与「示例」标签，底部「回应X ↗」与「举报」；下方「接着这段经历」按 `replies` 渲染编辑追问（左侧竖线引用块 + 「回应 X 的示例」小标），每条同样可回应与举报；页尾「接着谈谈 →」进入投稿页，「查看本期其他经历 →」返回列表。
- 举报仍是 thread 级（后端 `unique (user_id, issue_code, thread_id)`），详情页提交后本地标记「已举报」；返回列表时 `onShow` 重新拉取 `/discussion/reports/mine`，两处状态保持同步。
- 页内说明沿用设计稿版式，但把「原型演示 · 内容仅保存在本机」改成「示例内容 · 新写的经历会进入运营后台，不会自动公开。」，与投稿、举报都进后台的现状一致。
- 新增 `pages/discussion-thread/index.{json,ts,wxml,wxss}`，`index.wxss` 通过 `@import "../discussion/index.wxss"` 复用讨论页的顶栏、字体、底部导航等基础样式，只在本地补详情排版；`app.json` 已注册该页。
- 验证：`tsc` 类型检查通过；微信开发者工具 `preview` 构建 635.6 KB 成功；自动化点击列表「查看这段对话」成功进入 `pages/discussion-thread/index`（thread=岚、replies=2、无报错），滚动截图核对正文、追问、举报按钮与页尾两个入口。仍需上传小程序才在手机上生效。

### 2026-11-03 写下经历：进入前先选择继续原稿还是重新写

- 以前进入投稿页会把本机草稿（或账户里已提交的回应）直接填进输入框，用户看不到「已经是旧内容」这件事。现在进入 `pages/discussion-compose` 时先不填充，而是在导语下方给出选择条：「你还有一份未完成的草稿，已为你保留。可以继续原稿，或放弃后开始这次回应。」（若来源是账户里已提交过的回应，首句改为「你已经写过一段回应」），下方两个动作「继续原草稿」「放弃原稿，开始这次」。
- 从「本期讨论」或「一段对话」点「回应X / 接着谈谈」都会走这个选择；只有列表页的「继续未完成的草稿」会带 `resume=1` 自动继续，避免多一次点击。
- 本机草稿优先于账户记录；选择「继续原草稿」后本地草稿会回填并置 `restored`，选择「放弃原稿，开始这次」只清掉本机草稿（账户里已提交的回应不会被删除，仍可在「我的」里看到）。开始输入任意文字等价于选择重新写，会覆盖同一条内容的本机草稿。
- 验证：`tsc` 通过；开发者工具自动化跑通完整流程：输入→重进出现选择条→「继续原草稿」回填且 `restored=true`→重进再选「放弃原稿，开始这次」清空并删除本机草稿→再进无选择条；截图核对选择条版式。

## 2026-11-03 后台首页重建为「工作台」，下线健康与迁移面板

- 取消原有「健康与迁移」：删除总览里的 API STATUS（`/health` 状态与数据库/对象存储/缓存依赖）与 SCHEMA STATUS（迁移账本 `appliedCount/availableCount/pending`）两个面板，同时移除 `health`、`migrationStatus` 状态、`normalizeHealthResult`、`/health` 与 `/admin/system/migrations` 的请求与校验以及登出重置；后台不再展示迁移账本，迁移仍由启动日志与数据库账本维护（`/api/health/ready` 仍供运维与网关探活使用）。
- 新「工作台」结构：顶部问候卡（`早上好/下午好/晚上好，<姓名>` + 角色 + 已授权模块数 + 最近同步时间）与快捷入口（期刊工作台、审核用户经历、观察记录、员工与权限、刷新数据）；中部 6 张指标卡——期刊（已发布期号、草稿/归档数、发布时间）、待审核的用户经历、观察记录（已保存/草稿/超期草稿/保留期）、会员总数与最近注册、删除申请（待处理/到期/失败/最早申请）、审计记录总数；底部「最近操作」（6 条，动作与资源类型做了中文映射，未命中的保留原标识）与「当前授权模块」（12 个模块 chip，已授权高亮，并说明授权位置）。
- 数据加载重构：`loadDashboard` 改为与员工视角同一套按模块并行拉取（`canAccessModule` + `optionalFetch` 返回 `null` 再过滤），未授权模块不再发请求、也不参与响应校验，因此**被收窄模块的超级管理员不会再因为 403 报「无法读取 API 数据」**；进入总览时额外拉取审核队列与会员列表以生成指标；`loadStaffDashboard` 合并进 `loadDashboard`，单一入口。导航与标题同步改为「工作台」（`WORKSPACE / OVERVIEW`）。
- 验证（本机开发联调 `http://192.168.1.32:61022` + Playwright，真实数据库）：全量超管 13 项断言全部通过——标题为工作台、旧「健康与迁移/API STATUS/SCHEMA STATUS」为 0、问候语、`已授权 12 / 12 个模块`、6 张指标卡且顺序为 JOURNAL/REVIEW/OBSERVATIONS/MEMBERS/PRIVACY/AUDIT、最近操作与授权模块区块存在、12 个 chip 全部点亮、桌面与 820px 均无横向溢出、无控制台报错（仅 dev server 的 favicon 404）。另建受限超管 `devlimited`（仅授权「期刊与首页策展」）走完「创建 → 收窄授权 → 首次改密 → 进后台」，13 项断言通过——工作台正常打开、只剩 1 张期刊指标卡、页面无「无法读取 API 数据」、侧栏无会员列表、`/api/content/issues` 200、`/api/admin/observations` 403、`/api/admin/employees` 仍 200。测试账号已删除，开发库恢复 0 个员工账号。
- 已发布生产：仅同步 `management/src/App.vue` 与 `management/src/admin-theme.css`，`build admin` 后 `up -d --no-deps admin`（API 与数据库无变化）。线上 bundle `index-Cji-Ay8z.js` / `index-D15Gp1rV.css`：`WORKSPACE / OVERVIEW`、`最近操作`、`当前授权模块` 均命中，旧「健康与迁移」为 0，样式含 `overview-metrics`；`/` 与 `/api/health/ready` 均 200，admin 容器 Up。备份 `source-pre-overview-rebuild-20261103-113912.tar.gz`，镜像 `myriad-she-admin:pre-overview-20261103-113912`，回滚时重新打标后 `up -d --no-deps admin`。
- 说明：工作台指标全部来自各模块已有接口，不新增后端路由；`life-cards`、`life-card-views`、`media`、`settings` 等模块暂未做卡片，保持侧栏入口，后续可按需补充。

## 2026-11-03 角色与模块解耦：任意角色可提升并单独授权

- 模块授权不再与角色写死：`effectiveAdminModules` 对任何角色都按 `module_permissions` 计算（`NULL` = 角色默认、`[]` = 不授权、数组 = 显式授权）。超级管理员默认仍是全部 12 个模块，但同样可以被收窄或恢复默认，取代上一节「超管固定全部模块、弹窗只读」的做法。
- 鉴权规则：`adminModulesAllow` 对登记在模块里的接口一律按实际授权判定；未登记在任何模块中的接口（员工管理、发布、删除媒体、停用会员、系统设置写入等）仍只按角色放行给超级管理员。`GET /admin/me` 返回按覆盖计算后的 `permissions`，后台导航与初始数据加载随之收缩。
- 角色可提升/降级：`PATCH /admin/employees/:id` 允许把任意账号改为超级管理员（也允许降级），角色变化且未显式传模块时自动回到新角色的默认授权（超管 = 全部 12 个）；保留「至少一名启用的超级管理员」校验，并新增「不能修改当前登录账号自己的角色」（原有「不能停用自己」保留）。`POST /admin/employees` 接受任意角色与显式模块。
- 后台界面：「编辑」弹窗的角色下拉对所有人开放（含超级管理员）、账号状态可改、模块勾选区对所有角色显示；「授权模块」弹窗对超管不再只读，可正常勾选保存；列表摘要去掉「全部模块」特例，统一显示「角色默认 / 自定义 N 个模块」。
- 验证（开发联调真实数据库 + Playwright，14 项全部通过）：内容编辑 `devstaff` → 编辑提级为超级管理员 → 徽标变「超级管理员」、摘要「角色默认 12 个模块」→ 授权弹窗取消「会员列表」「系统设置」并保存 → 摘要「自定义 10 个模块」→ 该账号首次登录改密后进入后台：侧栏无「会员列表」「系统设置」、保留「期刊」，接口 `/api/admin/users` 403、`/api/content/issues` 200、`/api/admin/employees` 200。测试账号已删除，开发库恢复 0 个员工账号。
- 测试与构建：后端 `tsc --noEmit` 通过；`npm run test:unit` 176 项中 175 项通过（唯一失败仍为既有 `observation.controller`「管理端查看解密观察记录」，HEAD 上同样失败）；守卫用例更新为「超管保留超级管理员专用路由，但尊重模块授权」。后台 `npm run build` 通过。
- 已发布生产：同步 `backend/src/auth/admin-permissions.ts`、`backend/src/admin/admin-management.controller.ts`、`backend/test/admin-auth.guard.spec.ts`、`management/src/App.vue`，`build api admin` 后 `up -d --no-deps api admin`。容器内对已编译产物断言：`superEmpty=0`、`superNull=12`、仅授权期刊的超管访问会员为 false、员工管理为 true、默认会员为 true、内容编辑默认仍是 5 项；线上 bundle `index-CFbYdVH_.js` 含新提示文案，`/` 与 `/api/health/ready` 均 200。备份 `source-pre-role-modules-20261103-112331.tar.gz`，镜像 `myriad-she-{api,admin}:pre-role-modules-20261103-112331`，回滚时重新打标后 `up -d --no-deps api admin`。
- 说明：角色默认模块仍作为「预设值」保留在代码中（超管 12、内容编辑 5、客服只读 2），但任何账号都能覆盖，不再存在写死的模块限制；如果希望连默认预设也在后台按角色维护，可再加一层角色预设表。

## 2026-11-02 员工改为按模块单独授权

- 新增后台模块目录 `backend/src/auth/admin-permissions.ts`（12 个模块：期刊与首页策展、实践页面与目录、页面与协议、媒体库、用户经历审核、观察记录管理、隐私申请、会员列表、审计日志、生命牌文案、生命牌查看记录、系统设置），每个模块登记允许的 `方法 + 路径` 规则、中文名与说明，并提供 `parseAdminModuleOverride`、`effectiveAdminModules`、`adminModulesAllow`。
- 迁移 `060_admin_module_permissions.sql` 为 `admin_accounts` 增加 `module_permissions text[]`：`NULL` 表示跟随角色默认授权（内容编辑 = 期刊/实践/页面/媒体/经历审核；客服只读 = 会员/设置），空数组表示显式不授权任何模块。API 启动时自动应用该迁移。
- `AdminAuthGuard` 改为按模块授权判定：`super_admin` 与环境管理员始终全部放行；员工每次请求都读取数据库中的角色与 `module_permissions`，因此调整授权后无需重新登录即生效；`GET /admin/me`、`PATCH /admin/me/password`、`POST/DELETE /admin/me/avatar` 始终允许，首次登录/重置密码后的改密闸门保持不变。
- 发布、删除媒体、停用会员、修改系统设置、员工与头像管理仍只允许超级管理员，未登记为可授权模块，避免越权提升。
- `GET/POST/PATCH /admin/employees` 增加 `modulePermissions` 字段（创建时不传即跟随角色默认，PATCH 传 `null` 恢复角色默认，传数组为显式授权，非法模块返回 400）；`GET /admin/me` 返回当前账号的生效模块列表 `permissions`，超级管理员编辑弹窗中的模块授权固定为全部模块。
- 后台界面：员工列表在角色徽标下显示「角色默认 N 个模块 / 自定义 N 个模块」；员工编辑弹窗新增 12 个模块的勾选卡片（含每项说明、已授权数量与「恢复角色默认」按钮）；左侧导航、默认落地页与初始数据加载全部改为按生效模块判定，只拉取已授权模块的数据，未授权模块不再出现在导航中；无任何授权时导航提示「暂无授权模块」。
- 默认授权相对旧硬编码白名单有两处有意放宽：内容编辑可编辑实践共同文案（`practice-copy`）与「关于 MYRIAD SHE」草稿，但两者发布仍仅超级管理员；客服只读可查看数据库迁移状态。其余默认权限不变。
- 验证：后端 `npm run lint`（`tsc --noEmit`）通过；`npm run test:unit` 现在可以完整编译并运行 176 项，175 项通过——唯一失败项 `observation.controller.spec.ts` 的「管理端查看解密观察记录」在 HEAD 上同样失败，属既有问题；顺带修复了 `content.controller.spec.ts` 中阻断整包编译的两处既有类型错误。新增守卫用例覆盖模块覆盖、显式空授权、超级管理员豁免与授权解析。后台 `npm run build`（`vue-tsc` + Vite）通过。
- 员工列表每行在「编辑」左侧新增独立的「授权模块」按钮（超级管理员行不显示），点击打开专用弹窗：12 个模块勾选卡片、「已授权 N 个模块（自定义/角色默认）」、内联的「恢复角色默认」，保存走同一 `PATCH /admin/employees/:id`，成功后刷新列表摘要（`自定义 N 个模块 / 角色默认 N 个模块`）；编辑弹窗中的模块勾选保留，两个入口读写同一字段。列表操作列宽度由 92px 调整为 172px，`min-width` 700px，两个按钮同排不换行。
- 验证（本机开发联调 `http://192.168.1.32:61022` + Playwright + 员工接口替身）：按钮顺序为「授权模块 | 编辑」且两按钮同一行、间距 6px；超级管理员行无该按钮；弹窗 12 项、初始 6 项勾选显示「自定义」；勾选审计后保存发出 `modulePermissions: [journal, practice, pages, media, contributions, observations, audit]`；恢复默认发出 `null`；全部取消发出 `[]`；列表摘要分别变为「自定义 7 个模块 / 角色默认 5 个模块 / 自定义 0 个模块」；Esc 与点击遮罩均可关闭；编辑弹窗仍保留模块区块；无控制台报错。
- 已同步到生产：仅同步 `management/src/App.vue` 与 `management/src/admin-theme.css` 并 `docker compose build admin && up -d --no-deps admin`；API 与数据库无变化（`PATCH` 接口与 060 迁移上一轮已上线）。
- 创建员工账号支持选择「超级管理员 · 全部权限」：`POST /admin/employees` 现在接受 `super_admin`（此前只允许内容编辑与客服只读），创建时强制 `module_permissions = null` 并拒绝携带模块覆盖，避免出现「看起来授权了但被超管豁免忽略」的配置；新账号仍需首次登录改密。为避免绕过受控初始化，`PATCH /admin/employees/:id` 依旧拒绝把已有账号提升为超管，需要超管时请新建账号。后台创建弹窗的角色下拉新增该选项并补充说明。
- 验证（本机开发联调，真实数据库）：Playwright 通过「创建员工账号」实际创建 `devsuper` 超管账号，列表出现该账号、角色徽标为「超级管理员」、模块摘要为「全部模块」、授权弹窗只读 12 项；用该账号登录被要求先改密；随后已从开发库删除测试账号。后端 `tsc --noEmit` 与后台构建均通过。
- 已发布生产：仅同步 `backend/src/admin/admin-management.controller.ts` 与 `management/src/App.vue`，`build api admin` 后 `up -d --no-deps api admin`；线上 `dist` 已包含新校验代码，bundle `index-DhY2e5u-.js` 含「超级管理员 · 全部权限」，`/`、`/api/health/ready` 200，未登录 `/api/admin/me` 401。备份 `source-pre-super-role-20261102-180330.tar.gz`，镜像 `myriad-she-{api,admin}:pre-super-role-20261102-180330`。
- 超级管理员行的「授权模块」也可点击，但为只读预览：12 个模块全部勾选且复选框禁用、显示「超级管理员固定拥有全部 12 个模块」、隐藏「保存授权」与「恢复角色默认」，底部按钮改为「关闭」；后端仍拒绝为超管写入覆盖。这样生产只有超管账号时也能看到该功能入口与其含义。员工「编辑」弹窗对超管同样不再显示模块勾选区，改为一行说明「超级管理员固定拥有全部 12 个模块，不能单独增减」，避免出现「能勾选但保存不生效」的误导。
- 验证（Playwright + 员工接口替身）：超管编辑弹窗无模块勾选区且显示固定说明；员工编辑弹窗与「授权模块」弹窗仍为 12 项可勾选。已重建生产 admin 镜像，线上 bundle `index-CW0M3jAK.js` 含说明文案，`/` 与 `/api/health/ready` 均 200；备份 `source-pre-edit-super-note-20261102-175759.tar.gz`、镜像 `myriad-she-admin:pre-edit-super-20261102-175759`。
- 验证（Playwright + 员工接口替身）：超管行按钮存在，弹窗 12 项全选且全禁用、无保存按钮、文案与只读说明正确；普通员工弹窗仍可编辑（5 项勾选、保存按钮存在）。已重建生产 admin 镜像，线上 bundle `index-BPAfHabA.js` 含「授权模块 / 保存授权 / 超级管理员固定拥有全部」，`/` 与 `/api/health/ready` 均 200；备份 `source-pre-super-grant-20261102-174712.tar.gz`、镜像 `myriad-she-admin:pre-super-grant-20261102-174712`。
- 员工列表不包含内置环境管理员：生产 `ADMIN_DEV_USERNAME`（当前为 `owner`）与开发环境的 `admin` 由服务器环境变量校验，登录后 token 的 `sub` 为 `admin:<账号名>`，不会写入 `admin_accounts`，因此 `/admin/employees`（只查该表）里看不到它，也无法停用、改角色或单独授权。为消除困惑，列表上方在以内置环境管理员登录时显示说明条：说明它来自环境变量、不在列表中，以及需要可管理账号时改用「创建员工账号」；以数据库账号登录时不显示。生产库当前只有 1 个员工账号（`zhangmingtao` / 张明涛，super_admin），开发库为 0 个。
- 验证（Playwright + 员工接口替身）：以内置 `admin` 登录显示说明条且空列表文案正常；把 `/admin/me` 替身为数据库超级管理员 `zhangmingtao` 后说明条消失、该账号正常出现在列表且无「授权模块」按钮。已同步生产并重建 admin 镜像，线上 bundle 含「内置环境管理员」文案，`/` 与 `/api/health/ready` 均 200。
- 已发布到生产 `https://www.myriadshe.com`（服务器 `118.25.227.159`，目录 `/opt/myriad-she`，Compose 项目 `myriad_she_prod`）：同步 `backend/src`（控制器、守卫、新增模块目录）、`backend/sql/060_admin_module_permissions.sql` 与 `management/src`（`App.vue`、`admin-theme.css`、`style.css`）共 7 个文件，`docker compose build api admin` 后 `up -d --no-deps api admin`；gateway、PostgreSQL、Redis、MinIO 未重建。发布前已将源码、数据库转储与镜像分别备份为 `/data/backups/myriad-she/{source,postgres}-pre-module-permissions-20261102-171716.*` 和 `myriad-she-{api,admin}:pre-modules-20261102-171716`。
- 发布后验证：API 启动日志出现 `Applied database migration 060_admin_module_permissions.sql`，`app_schema_migrations` 最新为 060，`admin_accounts.module_permissions` 为可为空的 `text[]`；`/`、`/api/health/ready`、`/api/content/home` 均 200，未登录 `/api/admin/me` 为 401；管理员登录后 `/api/admin/me` 返回 12 个模块与 `permissionOverride: null`，`/api/admin/employees` 含 `modulePermissions` 字段，审计日志、系统设置、期刊接口均 200；线上后台 bundle 已包含「模块授权 / 恢复角色默认」文案。当前生产仅 1 个超级管理员账号，尚无员工账号，模块授权需在「员工与权限 → 编辑」中按人勾选。
- 回滚方式：源码用上述 `source-pre-module-permissions-*.tar.gz` 覆盖回去；镜像可 `docker tag myriad-she-{api,admin}:pre-modules-20261102-171716 myriad-she-{api,admin}:production` 后 `up -d --no-deps api admin`；`module_permissions` 列可留可删（`alter table admin_accounts drop column module_permissions`），旧代码不读取该列。
- 小程序首页三行刊期标题与本次权限改造不同渠道：本次只发布 API 与管理后台，小程序端仍需在微信开发者工具中上传体验版/正式版。

## 2026-11-02 小程序首页第一栏改为三行刊期标题

- 首页 `issueMeta` 栏改为竖排三行：`当期策展` / `ISSUE 02` / `SEPTEMBER 2026 · A CURATED EDITION`，取代原先把眉题与月份放在左列、`issue.code` 靠右的两列写法。
- 文案仍全部来自已发布首页数据：第一行固定栏目名 `当期策展`；第二行取 `issueMeta` 眉题（后台保存时它等于期刊标签，如 `ISSUE 02`），缺失时按 `issue.code` 里的数字补成 `ISSUE 0N`；第三行取 `issueMeta.month`，英文月份缩写展开为大写全称（`Sep 2026` → `SEPTEMBER 2026`）并拼接固定副题 `A CURATED EDITION`，中文月份写法保持原样。
- 排版：栏目名 24rpx、期刊编号 33rpx（沿用原字号）、刊期副题 22rpx，左对齐 Georgia 衬线；按样式等比换算，320–414px 宽度下三行都保持单行。
- 同步后台「首页策展 → 小程序首页预览」：`issueMeta` 栏目改为同样的三行排印，草稿里眉题/月份为空时回退到刊期信息面板的期刊标签与刊期月份；刊期信息面板补一行说明该排印与月份缩写展开规则。后台 `npm run build`（含 `vue-tsc`）通过。
- 仅修改小程序首页 `pages/home` 的 `index.ts`、`index.wxml`、`index.wxss`，以及后台的 `management/src/App.vue`、`management/src/style.css`；未改接口与发布逻辑，未上传体验版或正式版，仍需开发者工具与真机确认视觉效果。

## 2026-11-02 正式域名切换至 www.myriadshe.com 并发布最新版

- 生产代码目录仍为 `/opt/myriad-she`；发布前将原目录完整备份到 `/opt/myriad-she.pre-myriadshe-20261102-143700`，并额外备份源码、环境文件、Nginx 配置和 PostgreSQL 自定义格式转储到 `/data/backups/myriad-she/*-pre-myriadshe-20261102-143700*`。
- 生产证书使用 `/data/myriadshe.com_bundle.crt` 与 `/data/myriadshe.com.key`，SAN 覆盖 `myriadshe.com`、`www.myriadshe.com`，有效期至 2027-01-20；Compose 同时保留旧域名证书挂载，用于旧链接跳转。
- Nginx 正式入口改为 `https://www.myriadshe.com`：HTTP 和裸域均 301 到 www，旧 `hszfckga.com` 域名保留 301 跳转；API、MinIO 公共媒体和后台均由主域名提供。
- `.env.production` 已切换 `VITE_API_BASE_URL`、`CORS_ORIGIN`、`MINIO_PUBLIC_ENDPOINT`；后台镜像按新地址重建，产物中的 API 地址为 `https://www.myriadshe.com/api`。
- 本次发布包含最新后台错误弹窗、微声音放宽与总览一致性修复；API 启动迁移已应用至 `057_issue_practice_copy.sql`，发布后 PostgreSQL 数据量保持为 1 期、8 个发布快照、3 条观察、2 个用户。
- 验证通过：`https://www.myriadshe.com/` 与 `/api/health/ready` 返回 200，裸域返回 301，CORS 预检返回 204 且允许新来源，签名媒体对象返回 200，API/PostgreSQL 均为 healthy。
- 小程序正式环境 API 已改为 `https://www.myriadshe.com/api`，并将 `ENV` 切到 `prod`；仍需在微信公众平台配置 request/uploadFile/downloadFile 合法域名，并重新上传发布小程序版本，平台白名单无法由服务器部署替代。
- 旧域名证书将于 2026-11-03 到期；过渡期结束后应移除旧域名跳转或续期旧证书，避免历史 HTTPS 链接出现证书过期提示。
- 后台登录页简化为仅保留 `MYRIAD SHE` 品牌字、账号/密码表单和登录按钮，移除管理后台说明文案；底部备案号页脚改为透明背景并去掉分隔线。
- 登录页改为左右分栏布局：左侧为以 `MS` 为主视觉的深赭红/米白品牌图（`management/public/login-ms-brand.png`），右侧为账号密码登录；桌面端卡片居中，移动端图片在上、表单在下，备案号保持透明页脚。
- 左侧品牌图进一步简化为米白渐变底、`MYRIAD SHE` 字标与居中的 `MS` 字标，去掉了拱形、圆环、花瓣和说明文字。
- 新增企业微信扫码登录：`GET /api/auth/admin/wecom/config` 下发企微应用参数和一次性 state，`POST /api/auth/admin/wecom/login` 校验 state 后用 code 换取企业微信成员身份并签发与账号密码登录一致的后台 JWT；后台登录页增加「企业微信扫码登录」入口和二维码面板。
- 企微登录身份映射：启用中的员工账号按 `admin_accounts.wecom_user_id` 或 `username` 匹配企微 UserID；旧版环境管理员和 `ADMIN_WECOM_SUPER_ADMIN_USER_IDS` 允许的 UserID 以超级管理员身份登录。新增迁移 `058_admin_wecom_binding.sql`。
- 生产 `.env.production` 已写入 `ADMIN_WECOM_LOGIN_ENABLED`、CorpID、AgentID、应用 Secret、`ADMIN_WECOM_REDIRECT_URI=https://www.myriadshe.com/` 和白名单；企业微信管理后台仍需把 `https://www.myriadshe.com/` 加入应用可信域名/扫码登录回调域，否则扫码后会被企微拒绝跳转。
- 企微域名归属验证文件 `WW_verify_E1sExmCyjcGZWz6q.txt` 放在 `management/public/`，随后台镜像发布到站点根目录；同时将企微应用的授权完成回调域名由旧域名改为 `www.myriadshe.com`。
- 登录页二维码改为独立白底圆角卡片，二维码 iframe 不再直接贴在米白面板上；移动端取消卡片左右留白，避免二维码横向溢出。
- 修复登录页「企业微信扫码登录」按钮看不清：原因是 `.login-layout .login-panel button` 把主按钮的深棕背景套到了扫码按钮上，而文字仍是深灰（对比度约 1.38:1）。现将主按钮样式限定为 `button[type="submit"]`，扫码按钮改为白底、棕字、细棕边框，对比度约 9.94:1；同时修复「返回账号登录」被主按钮背景覆盖的问题。
- 员工列表由五列压缩为四列（员工 / 角色 / 状态 / 操作），角色和账号状态改为只读徽标；角色修改、启停、企业微信绑定、最近登录、密码状态和重置密码全部收进「编辑」弹窗。
- 新增员工头像：
  1. 迁移 `059_admin_avatar.sql` 增加 `admin_accounts.avatar_object_key`，头像对象存 MinIO 的 `admins/avatars/<id>/` 前缀。
  2. `GET /api/admin/me` 返回当前员工资料和 7 天签名头像地址；`POST/DELETE /api/admin/me/avatar` 供员工维护自己的头像。
  3. `POST/DELETE /api/admin/employees/:id/avatar` 供超级管理员在编辑员工资料时维护头像。
  4. 右上角账号头像与员工列表头像优先显示上传图片，没有头像时统一显示 `M`；员工编辑弹窗支持选择、更换和恢复默认头像。
- 员工账号头像支持 JPEG、PNG、WebP，最大 2 MB；自助资料接口对所有已登录员工开放，员工头像管理接口仍仅超级管理员可用。
- 「员工与权限」重构：
  1. 增加员工总数、启用、企微绑定、停用四项概览，以及三类角色的权限说明卡。
  2. 增加姓名/账号/企微 UserID 搜索、状态和角色筛选。
  3. 表格展示头像、账号、角色、企微绑定状态、最近登录和操作；超级管理员标记为受控账号，不允许停用、降级或重置密码。
  4. 新建员工支持填写企微 UserID；新增「编辑资料」弹窗，可修改姓名和企微绑定/解绑。
  5. `GET /api/admin/employees` 返回 `wecomUserId`、`passwordChangeRequired`；`POST/PATCH` 支持企微 UserID 校验与唯一性检查，审计记录包含绑定状态。

## 2026-10-30 后台统一错误弹窗与微声音「有音频即可」

- 后台所有操作错误不再显示在页面顶部：错误状态统一进入居中弹窗，标题固定为「操作未完成」，展示后端返回的简短原因，提供「知道了」关闭，支持点击遮罩或 `Esc` 关闭，并自动聚焦按钮。
- 登录、期刊、实践、页面、观察、会员、系统设置、员工、媒体等模块的错误状态均接入统一弹窗；原有字段级错误会即时清空，避免弹窗与行内提示重复。
- 微声音不再要求固定 2–3 段：草稿可保留 1–3 段，发布时只保留已上传音频的条目，至少 1 段有音频即可；未上传音频的草稿条目发布时忽略，不再阻塞整期发布。
- 后台文案更新为「可添加 1–3 段；至少 1 段有音频即可」，小程序首页仍按实际可用段数显示主声音和「更多声音」。
- 验证：后台 `npm run build` 通过；Playwright 使用系统 Chrome 验证登录失败和期刊保存失败均只出现弹窗、顶部错误数为 0，保存 payload 的微声音字段仅含后端登记字段；后端定向测试「publishing audio keeps any uploaded subset and drops unfinished drafts」通过。截图见 `docs/screenshots/admin-error-modal.png`、`admin-error-modal-save.png`、`admin-audio-editor.png`。
- 修复后台总览误报「期刊列表、生命周期摘要与首页发布内容不一致」：期刊列表接口补充已发布快照里的微声音标题/时长、首页文案、字号、颜色和封面说明字段；一致性校验改为对比已发布快照，不再拿当前草稿与线上首页比较。因此保存首页文案但尚未发布时，总览仍可正常打开。验证：登录后台总览正常加载，弹窗与行内错误均为 0。

## 2026-10-30 修复微声音草稿保存「未登记字段」

- 后台保存期刊草稿时，微声音条目对象带有前端预览用的 `audioUrl` 字段；后端只登记 `id / title / duration / audioObjectKey / quote / subtitle / transcript`，因此返回「微声音条目包含未登记字段」。
- 保存前新增 microvoice payload 归一化，只提交后端登记字段；同时从 `ManagedAudioTrack` 移除不再使用的 `audioUrl`、`playbackId` 展示字段。
- 已重新构建后台；后台开发服务会热更新，重试保存前刷新页面即可。

## 2026-10-30 首页微声音「更多声音」入口与可拖拽进度

- 后台微声音原本已支持最多 3 段（「添加声音」），本次只调整小程序首页的展示方式。
- 首页默认只展示主声音；当本期发布 2–3 段时，在「02 微声音」栏右侧显示紧凑的「更多声音 +」入口，展开后变为「收起 −」，额外声音列表继续跟在主声音文案之后。
- 声音进度条移到引言上方、播放行进度的下方；额外声音的进度条也在各自标题行之后、引言之前。这样进度条靠近播放控制，又不会被长文字稿压到页面很下方。
- 进度条支持触摸拖拽和轻点定位：播放中按下时暂停当前播放并进入拖动态，松手后按原播放状态恢复；拖动过程中实时更新时间、百分比和滑块位置。
- 展开后保留每段声音的播放、时长、进度、引言、说明和文字稿；当额外声音正在播放时阻止收起，并提示「正在播放，暂停后可收起」，避免把正在播放的进度隐藏。
- 使用 3 段注入数据验证：空闲态标题行同时容纳时长和「更多声音 +」；播放态进度条位于引言上方，拖到约 82% 后时间变为 00:23 并恢复播放；轻点约 32% 可定位到 00:09。截图见 `docs/screenshots/home-audio-more-idle.png`、`home-audio-more-collapsed.png`、`home-audio-more-expanded.png`、`home-audio-progress-layout.png`、`home-audio-progress-drag.png`。
- 仅修改本地小程序首页，未改接口、后台发布逻辑或其他页面；未发布体验版或正式版。

## 2026-10-30 隐私政策/用户协议页视觉简化

- 移除正文顶部的 `policy-meta` 行（原来的「我的 · PRIVACY & CHOICES」），页面不再出现「我的」这一栏。
- 同步移除该法律页自带的底部自定义 TabBar（首页/实践/我的）；它是从「我的」等页面 push 进来的二级页，保留左上角返回即可，避免与真实 Tab 导航混淆并遮挡长文。
- 页面改为「暖沙色底 + 米白纸面卡」：底 `#e9e1d4`、纸面 `#fbf7ef`、文字/call-to-action 使用棕色系；标题、导语、日期和正文收进同一张纸面卡，减少散落的边框与色块。
- 日期改为轻量信息行（更新日期、生效日期、版本），正文前只保留一条分隔线；底部加一行低调的 `MYRIAD SHE` 收尾。
- `pages/privacy-policy` 同时服务隐私政策与用户协议，两个文档共用新布局；`index.ts` 删除已无用的 `switchTab` 方法，加载/错误/重试逻辑不变。
- 验证：WXML 标签闭合、WXSS 括号检查通过；微信开发者工具编译通过；自动化进入隐私政策页，`.policy-meta` 与 `.policy-tabbar` 均为 0，顶栏只有 1 个，纸面卡、正文和底部品牌行正常显示。截图见 `docs/screenshots/privacy-policy-redesign.png`、`privacy-policy-redesign-bottom.png`。
- 仅修改本地小程序页面结构与样式，未发布体验版或正式版。

## 2026-10-30 修复用户协议发布 effectiveDate 报错

- 请求编号 `0f42d1e8-9ed8-4b44-8cac-1e2d71f9923f`：用户协议发布返回 400，提示 `effectiveDate内容无效或超出长度限制`。
- 核对数据库：`user-agreement` 草稿的 `effectiveDate` 长度为 0；此前“保存草稿”允许生效日期为空，但“发布”要求必填，因此保存成功后发布才失败。
- 后台管理：生效日期字段标记为「发布必填」并加 `aria-required`；空值草稿仍可保存，但会提示「草稿已保存，但生效日期为空，发布前请填写并再次保存」。发布前做前端拦截，自动滚动并聚焦到该字段，提示「请先填写生效日期并保存草稿，再发布」；字段为空时页面也会持续显示提醒。
- 后端：将生效日期的必填校验移到专用逻辑，发布时为空返回「生效日期不能为空，请填写并保存草稿后再发布」；超长仍返回带字段名的明确提示。发布接口的必填约束不变，避免生成缺少生效日期的线上协议。
- 验证：后端定向法律文档测试 13 项通过；后台 `npm run build` 通过；`npm run test:legal-ui`（系统 Chrome）通过，覆盖空日期保存提示、发布拦截与字段聚焦；本地 API 已重启并健康。
- 当前 `user-agreement` 草稿的生效日期仍为空，未替内容人员决定法律生效日；请在后台填写日期（例如 `2026-11-01`）并保存草稿后再发布。

## 2026-10-30 个人资料页视觉简化

- 页面改为「暖沙色底 + 一块深陶土账户卡 + 米白分组卡」：页面底色 `#e9e1d4`，账户卡 `#663124`，分组卡 `#fbf7ef`；不再额外引入红/绿/蓝等强调色。
- 顶部账户卡集中头像、昵称和手机号状态；原长列表拆成「账户 / 资料 / 设置」三组，9 个设置项按语义归组，行高 102rpx，分隔线统一使用低透明度棕色。
- 昵称编辑改为**直接替换“用户名”这一行**，避免输入框插在列表中间多出一条分隔线；编辑态截图见 `docs/screenshots/profile-redesign-edit.png`。
- 「退出登录」改为纯文字 `view` 操作（`logout-action`），不再使用填色胶囊按钮；头像仍保留原生 `<button open-type="chooseAvatar">`，因为这是微信更换头像的必要能力，与退出登录无关。
- 验证：微信开发者工具编译通过；个人资料页只有 1 个顶栏（`.profile-topbar`，`top: 0`、高 95px）；3 个分组卡、9 个设置行；「退出登录」实际标签为 `view`；页面滚动到底部后退出登录与协议链接均可见。截图见 `docs/screenshots/profile-redesign.png`、`profile-redesign-bottom.png`、`profile-redesign-edit.png`。
- 仅修改本地小程序页面样式与结构，未改接口、登录逻辑或其他页面；未上传体验版或正式版。

## 2026-10-30 修复个人资料页双重状态栏

- 现象：`pages/profile/index` 顶部同时出现微信原生导航栏和页面自绘的「个人资料」顶栏。
- 原因：页面 WXML 已有 `.profile-topbar` 并自行处理 `statusBarHeight`，但 `pages/profile/index.json` 未关闭原生导航栏。
- 修复：在 `profile/index.json` 增加 `"navigationStyle": "custom"`，只保留自绘顶栏。同步排查所有带自绘顶栏的页面，发现 `about`、`privacy`、`privacy-policy` 也缺少该配置，已一并补齐（`about`、`privacy-policy` 新增页面级 JSON）。
- 验证：微信开发者工具编译通过；自动化进入个人资料页，`.profile-topbar` 位于 `top: 0`、高度 95px（47px 状态栏 + 48px 顶栏），页面只有一个顶栏；截图见 `docs/screenshots/profile-single-topbar.png`。
- 仅修改本地小程序页面配置，未发布体验版或正式版。

## 2026-10-30 小程序「我的」页视觉重构

- 将「我的」从平铺的米色卡片改为「深陶土账户卡 + 米白档案卡」结构：自定义顶栏增加 `MINE / 我的` 标识；账户卡集中头像/昵称/个人资料入口与观察/经历双指标；下方三条档案模块用 01–04 编号、英文小标与衬线标题建立层级，隐私入口独立为横向设置卡。
- 会员、游客、账户已删除三种状态共用同一套账户卡版式；游客登录入口、删除后的「创建新的空账户」、昵称编辑、头像选择、观察记录/经历展开、隐私跳转等绑定与 aria 标签全部保留。
- 观察记录改为带左侧陶土标记的独立记录卡；讨论区补充「保存后进入运营审核」提示，贡献/旧版本机记录、删除、继续讨论、底部说明均保留。
- 修复后台「我的页面设置」中 `emptyTitle` 等富文本带内联 `font-size: 48px` 导致空状态标题被撑到 72px 的问题：新增 `normalizeRichTextSizing()`，在渲染前剔除 `font-size`/`line-height`，让所有富文本回到页面字号体系；空状态标题恢复为 21px 高。
- 使用微信开发者工具编译并自动化检查：会员态（30 条记录、首屏 2 条）、游客态、账户删除态、讨论展开态均正常；空状态标题实测 21px，页面无横向溢出。截图见 `docs/screenshots/mine-redesign-member.png`、`mine-redesign-guest.png`、`mine-redesign-deleted.png`、`mine-redesign-discussion.png`、`mine-redesign-empty.png`。
- 仅修改本地小程序源码，未上传/发布体验版或正式版；后台、API 与数据库未改动。

## 2026-10-30 期刊后台视觉统一

- 新增 `management/src/admin-journal.css`，在 `admin-theme.css`、`admin-fixes.css` 之后加载，把期刊工作台从独立的米色/衬线“纸张”样式收回到后台设计系统：统一白色面、陶土强调色、无衬线层级与 14/10 圆角。
- 期刊页新增上下文条；列表页左侧期次栏改为粘性导航，当前期用左侧陶土色标记；当前期概览改为轻渐变卡面、状态胶囊和统一指标格；模块工作台补充当前期状态/期号/草稿版本，栏目选择改为两列卡片，保存条增加“已同步/未保存”状态点。
- 侧栏增加「总览 / 内容 / 运营 / 系统」分组标签，并按角色隐藏空分组。
- 列表双栏在 1100px 以下收为单栏，640px 以下页头与保存条纵向排列；已通过生产构建和浏览器冒烟测试（7 个期刊二级菜单均无横向溢出）。截图见 `docs/screenshots/journal-redesign-list.png`、`journal-redesign-home.png`、`journal-redesign-mobile.png`。
- 仅重启本机 `myriad_she_admin` 使 Vite 重新加载新样式；API 与 PostgreSQL/Redis/MinIO 未改动，正式站和小程序未发布。

## 2026-10-30 期刊后台信息架构重组

- 后台原「内容运营」拆为一级菜单「期刊」，下设期刊列表、首页策展、人物故事、微声音、本期讨论、往期策展、媒体库 7 个二级模块；原「协议与隐私管理」调整为「页面与协议」，下设我的页面设置、关于 MYRIAD SHE、关于发布历史、用户协议、隐私政策。
- 期号信息、首页栏目、人物故事、微声音、本期讨论与往期入口仍共用同一份 `draftContent`，保存和发布按整期生效；媒体库保持全局独立，期刊列表的生命周期操作单独生效。
- 期刊模块页会自动选中当前线上期或第一期；切换二级模块保留未保存草稿；保存后停留在当前模块，不再清空表单。列表中补充整期概览、保存/发布/发布历史入口。
- 本期主题与本期问题改为只读派生值，来源固定为封面标题和「本期问题」栏目，避免两处维护。
- 已通过 `vue-tsc --noEmit`、生产构建和本机浏览器冒烟测试（7 个期刊二级菜单、模块切换草稿保留、保存停留、新建草稿回填、页面与协议分组、移动端无横向溢出）。正式站与小程序未发布。模块职责与保存边界见 `docs/journal-admin-ia.md`。

## 2026-10-23 协议 Word 导入本机部署

- 按用户指定部署本机联调环境，仅重建并重启 `myriad_she_api`、`myriad_she_admin`，更新各自依赖卷。后台入口：`http://192.168.1.32:61022/`。
- 已创建并校验 PostgreSQL 备份 `.migration-backups/legal-documents-20261023-145702/postgres.dump`，为更新前 API/后台镜像保留 `before-legal-20261023-145702` 标签。
- API 自动应用 `051_legal_documents.sql`；隐私政策正文、草稿、编辑版本 2、发布版本 2 及发布时间与迁移前一致，原发布历史 4 条保留。用户协议初始未发布。
- 本机回环及局域网 API readiness/后台首页均返回 200。真实鉴权接口和浏览器验证两份文档页面、DOCX 导入预览、格式保留、取消后草稿不变及历史读取通过。
- PostgreSQL、Redis、MinIO 启动时间未变；正式站和微信小程序未发布。详情见 `docs/legal-document-management.md`。

更新时间：2026-10-16  
项目目录：`D:\UGit\MYRIAD SHE`  
本地开发/验证目标：`192.168.1.32`（Docker；本文不记录登录凭据或环境密钥）

## 项目架构

| 层 | 当前方案 | 代码位置 |
| --- | --- | --- |
| 微信小程序 | 原生 TypeScript、云端 API | `miniprogram/` |
| 业务 API | NestJS / Node.js | `backend/` |
| 管理后台 | Vue 3 + TypeScript + Vite | `management/` |
| 关系数据库 | PostgreSQL；业务数据以云端为准 | Docker Compose 服务 `postgres`、`backend/sql/` |
| 缓存 | Redis；公开首页短时缓存，允许读取降级 | Docker Compose 服务 `redis` |
| 文件、图片与音频 | MinIO 对象存储 | Docker Compose 服务 `minio` |
| 本地/联调运行 | Docker Compose 与根目录 `.env.local` | `docker-compose.yml` |
| 生产部署骨架 | 独立生产 Compose 与生产环境变量模板 | `docker-compose.production.yml`、`.env.production.example` |

开发联调地址（端口以 `.env.local` 为准）：

- API：`http://192.168.1.32:61021/api`
- 管理后台：`http://192.168.1.32:61022`
- PostgreSQL：`192.168.1.32:61023`
- Redis：`192.168.1.32:61024`
- MinIO API / Console：`192.168.1.32:61025` / `http://192.168.1.32:61026`

根目录 `.env.local` 含有凭据，已由 `.gitignore` 排除；不要复制到文档、代码仓库或对话输出。当前开发服务均规划在独立 Docker Compose 项目和数据卷中，不复用主机上其他项目的服务。

## 已实现

### 小程序与观察流程

- 首页、实践、我的、隐私、观察填写和观察详情页面均采用原生 TypeScript 页面源码。
- 两种观察方式按产品口径命名为“从现实处境开始”和“从四时气韵开始”；观察包含分步填写、云端草稿、自动保存、恢复、最终保存和详情查看。
- 首页期刊问题可带入观察。服务端在云端事务中确认期刊仍处于发布状态，并把标签和问题快照写入记录；旧期刊归档后，已有记录仍保留原快照。
- 草稿创建具备客户端幂等标识；记录更新带 revision，冲突时拒绝旧版本覆盖。已完成记录不可被降级或继续修改。
- 页面隐藏、账户删除/重新创建和认证代次切换均对普通读取及迟到响应做隔离，避免旧账户数据回写。
- 四时气韵生日默认不落库；API 读取、导出及历史答案保护/重加密路径均遵循该策略。

### 云端账户与数据生命周期

- 用户设置、观察列表、详情、导出和删除申请均从云端读取/写入；导出在同一 PostgreSQL 快照中读取，并避免导出微信凭证。
- 观察答案支持版本化 AES-256-GCM 封装，兼容受控的历史格式读取；管理端可分页保护/重加密历史记录，不返回正文。
- 账户删除支持冷静期申请、取消、到期 worker、租约、退避重试、管理员查看与安全重试；已删除账户内容被清除，匿名生命周期状态按保留策略追踪。
- 小程序和管理后台对服务端响应实施字段、枚举、长度及分页结构校验；涉及账户、运营和写入结果的响应禁止缓存。

### 内容运营与管理后台

- 管理端支持管理员登录、期刊草稿/发布/下架/归档、版本冲突保护、媒体上传与预览、未引用媒体扫描/回收及操作审计。
- 首页/期刊状态数量、当前发布内容、公开首页和媒体可用性会交叉核对；观察、删除申请与审计列表支持筛选、分页和生命周期统计。
- 实践页文案与入口由云端管理；观察入口固定开放，共同实践和日常之物在产品规则与真实流程确认前固定关闭。
- 期刊写入与公开首页缓存失效串行化；Redis 失效未确认时事务回滚并返回 `content_home_cache_unavailable`，防止数据库成功而首页继续展示旧内容。
- 管理会话过期、退出及旧请求返回均有代次隔离；媒体凭据仅在当前浏览器会话中暂存。

### 服务可靠性与部署准备

- PostgreSQL schema 由 API 启动迁移器顺序执行；迁移文件摘要和 advisory lock 用于防止并发执行或静默改写已登记迁移。
- API 有健康/就绪检查、请求编号、严格 DTO/环境配置校验、数据库连接池边界及优雅关闭。
- 管理后台总览提供只读数据库迁移账本状态，可识别待执行、缺失或被修改的迁移文件；不提供通过页面执行迁移的入口。
- Redis 故障不阻塞 API 就绪；公开读取可以回源 PostgreSQL。MinIO 对象键、类型、大小、签名 URL 和媒体回收路径均有约束。
- Compose 将开发环境与生产镜像骨架分离；生产模板要求替换占位密钥、域名和微信配置后再使用。
- 商店、会员、支付、履约开关在开发配置中均为关闭；支付与履约 mock 也关闭。当前阶段不启用这些能力。

## 验证状态

- 后端源码中登记的单元测试共 109 项，覆盖观察、内容、隐私、管理筛选、鉴权、数据库、环境、存储及健康检查等场景；其中新增迁移账本一致性判断用例。
- 本次远端执行后端单元测试 107 项，结果为 107 通过、0 失败；该结果对应迁移状态新增用例之前的远端版本，新增用例尚未重新执行。测试仅使用隔离替身，不连接真实 PostgreSQL、Redis、MinIO 或微信，也不能代替部署后联调。
- 部署后应记录 API 就绪、管理后台可访问、容器状态以及当前迁移账本结果；涉及真实账号/删除、微信、支付、履约的验收必须继续使用隔离测试配置。

## 未完成与约束

- 小程序真机/开发者工具联调、微信正式配置、生产域名/TLS、生产备份恢复演练和完整端到端验收尚需单独安排。
- 商店/会员商品与权益、支付真实商户配置、履约与售后规则需要业务确认和外部服务配置，确认前保持入口与开关关闭。
- 观察草稿治理口径已确认：保留 90 天阈值统计与只读筛选，不自动或批量清理；永久删除与恢复窗口不在本阶段新增。
- 生产部署必须先使用专用生产环境变量、备份数据库并确认回滚方式；本次只针对 `192.168.5.99` 开发联调 Compose 环境。

## 2026-10-16 编译与重启记录

- 代码已同步至 `192.168.5.99:/opt/myriad-she`；保留远端 `.env.local`、`node_modules` 和全部数据卷，未覆盖远端密钥配置。
- `docker compose --env-file .env.local build api admin` 成功完成，API 与管理后台镜像均已重建。
- 后端 `docker compose ... run --rm --no-deps api npm run build` 成功；过程中修复了 Nest 11 不提供 `TooManyRequestsException` 以及登录锁定状态收窄不足的类型错误。
- 管理后台 `docker compose ... run --rm --no-deps admin npm run build` 成功，`vue-tsc -b` 与 Vite 生产构建均通过；过程中修复了按钮事件参数、可空期刊编号和响应校验数字类型的边界。
- `docker compose --env-file .env.local up -d --no-deps --force-recreate api admin` 成功；API 与管理后台已重建并启动。管理后台仍按当前开发 Compose 以 Vite 服务提供页面，生产静态构建产物已验证。
- API `http://192.168.5.99:61021/api/health/ready` 与 `/api/health` 均返回 `status: ok`，数据库、对象存储和 Redis 检查通过；管理后台 `http://192.168.5.99:61022/` 返回页面并显示 Vite ready。
- PostgreSQL、Redis、MinIO 未被最终应用重启命令触碰；Redis、MinIO 保持原运行时长，PostgreSQL 在首次未加 `--no-deps` 的临时编译命令中被 Compose 自动重建后恢复健康，数据卷未删除。
- 远端 Compose 仍提示 `VITE_API_REQUEST_TIMEOUT_MS`、`VITE_MEDIA_UPLOAD_TIMEOUT_MS` 未显式设置；前端代码和 Dockerfile 使用 12000/90000 的默认值。本次不覆盖远端环境文件，后续可在环境变更窗口补齐这两个非敏感配置。
- 测试中发现并修正了一处过时断言：数据导出现在先声明 `REPEATABLE READ` 再读取用户快照，测试已同步该事务顺序。

## 2026-10-16 下一阶段源码与验收准备

- 观察填写页补充显式保存失败重试入口；重试继续沿用现有账户代次、版本冲突、最终保存幂等和异常响应守卫，不会绕过草稿恢复或把旧账户响应写回当前页面。
- 管理后台补充跳转到主要内容的键盘入口、分区导航、重新同步入口和明确的危险操作样式；观察治理区明确显示“90 天阈值仅统计与只读筛选，不自动清理”的当前产品策略。
- 生命周期策略按已确认口径保持不变：草稿不自动或批量清理；账户删除继续使用 7 天冷静期、worker 租约、退避重试和完成后永久删除，不增加恢复窗口。
- 内容运营、媒体回收、历史答案保护、隐私申请和审计列表继续复用现有管理接口契约、分页、筛选、游标与响应守卫；本阶段未新增用户端公开接口，也未新增数据库迁移。
- 小程序首页按已提供的原型逻辑整理为“当期策展、主题与封面、内容线索、微声音、此刻观察、目录跳转、关于入口”的连续阅读路径；目录跳转只使用云端返回的 `sections`，未引入静态 mock 内容。
- 实践页按原型整理为主叙事和三类入口：观察保持开放，共同实践和日常之物继续显示为关闭/研究中状态；我的页按观察记录、共同实践状态、隐私设置和未来能力分区，云端记录与账户删除状态保持原有守卫。
- 管理后台改为“健康与迁移、内容运营、观察治理、隐私申请、审计日志”五个可切换分区；内容运营内部承载期刊、媒体和实践配置，其余治理表格不再与编辑表单同时占据首屏。
- 首页菜单明确保留商店、会员、支付与履约关闭状态；未添加商店预览开关、商品入口或任何外部支付流程。
- 本阶段仅完成源码、测试准备和验收文档更新；未编译、未部署、未重启服务。真实数据库/Redis/对象存储、微信真机、备份恢复、域名/TLS 和生产配置仍须在用户明确允许后执行。
- 管理后台新增受管理员鉴权保护的只读迁移状态接口与总览卡片；它只核对可用迁移文件和 `app_schema_migrations` 账本，识别待执行、缺失或摘要变化，不提供页面执行迁移能力。

## 2026-10-19 用户授权后的编译与部署尝试

- 后端 `npm run build` 成功；测试 TypeScript 编译成功，109 项后端单元测试通过（单进程执行）。
- 管理后台 `vue-tsc -b` 类型检查通过；Vite 阶段因沙箱禁止 esbuild 创建子进程（`spawn EPERM`）未能完成，尚无完整管理后台构建结果。
- 已尝试连接文档指定的开发主机 `192.168.5.99`，但当前 SSH 身份被拒绝（`Permission denied (publickey,password)`）；因此未上传文件、未执行远端构建、未重启任何服务。
- 本机 Docker daemon 只发现其他项目的 `assetfixed-app` 服务，未触碰。未使用生产 Compose 或读取/输出 `.env.local` 配置内容。
- 下一步需恢复目标开发主机的有效 SSH 身份，并在允许 esbuild/Docker 的构建环境中完成管理后台构建；当前状态不是部署验收通过。

## 2026-10-19 用户补充凭据后的编译、部署与重启

- 使用用户提供的 SSH 凭据连接 `192.168.5.99`，未记录凭据；远端项目目录为 `/opt/myriad-she`。
- 已同步当前源码至远端，明确排除 `.env*`、Git 元数据、依赖目录、构建产物和微信私有配置；远端 `.env.local`、依赖卷和业务数据未覆盖。
- 远端 `docker compose --env-file .env.local build api admin` 成功；API 容器内 `npm run build` 成功，管理后台 `vue-tsc -b && vite build` 成功。
- 已执行 `docker compose --env-file .env.local up -d --no-deps --force-recreate api admin`；API 与管理后台均已重建并启动。
- API `/api/health/ready` 与 `/api/health` 返回 HTTP 200 和 `status: ok`，数据库、对象存储、Redis 检查通过；管理后台首页返回 HTTP 200。
- PostgreSQL、Redis、MinIO 未被重建，现有数据卷保留；商店、会员、支付、履约及其 mock 开关未启用。

## 2026-10-19 管理后台左侧导航部署

- 管理后台分区导航已调整为桌面端左侧固定侧栏，平板/手机端切换为可横向滚动导航；五个治理分区和键盘/ARIA 语义保持不变。
- 已同步源码并完成远端管理后台 `vue-tsc -b && vite build`，构建成功。
- 已执行 `docker compose --env-file .env.local up -d --no-deps --force-recreate admin`；`myriad_she_admin` 已重启并运行。
- 外部验证：管理后台返回 HTTP 200；API 就绪检查返回 HTTP 200。API、PostgreSQL、Redis、MinIO 未重建。

## 2026-10-19 管理后台全宽左侧布局重新部署

- 管理后台桌面布局扩展为左侧固定品牌/菜单与右侧全宽工作区，不再把页面内容限制在居中窄容器；小屏仍使用顶部导航布局。
- 管理后台远端 `vue-tsc -b && vite build` 成功，Vite 生产构建产物已验证。
- 已执行 `docker compose --env-file .env.local up -d --no-deps --force-recreate admin`；`myriad_she_admin` 已重启并运行。当前开发 Compose 使用 Vite 开发服务提供页面（HTTP 响应包含 `/@vite/client`），生产静态产物与类型检查也已在容器中构建验证。
- 外部验证：管理后台 `http://192.168.5.99:61022/` 返回 HTTP 200；API `/api/health/ready` 返回 HTTP 200，数据库与对象存储依赖状态正常。API、PostgreSQL、Redis、MinIO 未重建或重启。

## 2026-10-19 首页期刊封面调整（仅源码）

- 小程序首页当期封面显示高度从 720rpx 调整为 860rpx，空封面占位同步加高；后续内容局部图维持原尺寸，避免其他版块意外变形。
- 管理后台期刊封面字段明确标注为首页大幅封面配置，补充竖版约 4:5 的图片建议和首页裁切说明；现有按期刊上传、预览与保存机制继续生效。
- 沿用现有 `coverObjectKey` 管理字段与公开首页响应，不新增数据库迁移或公开接口。
- 本阶段只修改源码与进度记录；未编译、未部署、未重启服务，尚待获准后执行小程序/管理后台构建和真机验收。

## 2026-10-19 首页封面与底部导航视觉调整（仅源码）

- 首页期刊封面显示高度由 860rpx 增至 960rpx，封面保持横向铺满、纵向等比裁切；上下元信息和内容区的原有间距不变，空封面占位同步调整。
- 将微信原生文字 tabBar 替换为自定义底部导航组件，按参考图绘制首页圆点、实践线条、我的头像三个线性图标；保留三页 `switchTab` 导航、当前页选中状态、无障碍标签与安全区留白。
- 仅底部三个导航项改为自绘点击区域，不使用原生 `button`；页面其他表单操作按钮不在本次范围内。
- 本阶段仅完成源码和 JSON 格式检查；未编译、未部署、未重启服务，微信开发者工具与真机验收留待用户明确允许后执行。

## 2026-10-19 主导航页面标题统一（仅源码）

- 首页、实践、我的三个 Tab 页面系统顶部栏标题统一为 `MYRIAD SHE`，页面切换不再把“首页/实践/我的”作为顶部导航标题显示。
- 页面正文中的内容分区标题和自定义底部导航标签保持原样。
- 仅更新页面 JSON 配置；未编译、未部署、未重启服务。

## 2026-10-19 首页导航品牌样式与重复行移除（仅源码）

- 首页改用自定义导航栏，以红框参考的 Georgia 衬线、棕红色与约 31rpx 字号呈现 `MYRIAD SHE`；通过设备状态栏高度留出安全区，微信右上角胶囊仍由平台显示。
- 原系统小标题与下方重复品牌栏合并为单个品牌导航栏，移除额外的品牌/菜单行，原“当期策展”区随之向上移一行；菜单操作保留在导航标题右侧。
- 仅改首页页面配置、布局与状态栏高度读取；JSON 已通过解析检查，未编译、未部署、未重启，仍需开发者工具和真机确认系统胶囊区域位置。

## 2026-10-19 首页期刊元信息样式配置（仅源码）

- 首页“当期策展 / 月份 / 期刊编号”字号从原 22rpx 提升到约 16px（约放大 50%），默认棕色；布局留白保持既有节奏，并支持期刊单独配置字号与颜色。
- 首页元信息可使用管理后台配置的有限富文本；管理端提供加粗、斜体、下划线、换行、字号、颜色与内容编辑。留空时仍回退为当期标签、月份及期刊编号。
- 服务端对富文本长度、字号、颜色和标签进行约束，只保留基础文本格式标签并剥离全部 HTML 属性，避免脚本、链接、图片等不安全内容进入小程序；公开首页缓存版本同步升级，管理端的版本冲突合并也包含新字段。
- 首页交互控件均改为自绘 `view` 点击区域，不再使用该页的小程序原生 `button`；保留 `role`、无障碍名称与触摸反馈。其他页面原生按钮样式规则不变。
- 因当前 `content_issues` schema 没有首页元信息样式字段，新增顺序迁移 `017_home_issue_meta_typography.sql`，数据库实际变更需在获准部署后应用。
- 补充富文本清洗与样式边界单元测试、首页缓存 fixture；实现阶段先只完成源码，后续验证与部署状态见下方记录。

## 2026-10-19 首页期刊元信息构建与部署尝试

- 用户授权后端单元测试、后端与管理后台构建及目标环境部署/重启。
- 后端测试 TypeScript 编译阶段通过；Node 测试运行器在默认模式下因沙箱禁止创建子进程（`spawn EPERM`）无法启动。改为逐文件串行运行后，11 个测试文件共 110 项全部通过。
- 后端 `npm run build` 成功；管理后台 `npm run build`（`vue-tsc -b && vite build`）成功。
- 尝试 SSH 到 `192.168.5.99` 同步源码和重启服务，目标端拒绝当前可用身份（`Permission denied (publickey,password)`）；SSH agent 无可用身份。HTTP 健康检查与后台页面检查亦被当前网络代理拒绝连接。
- 因未能认证/连通目标主机，未上传代码、未应用 `017_home_issue_meta_typography.sql`、未重启服务；远端运行版本与数据库迁移状态未验证。没有触碰其他 Docker 项目或数据卷。
- 当时尚未同步或应用迁移；后续迁移结果见下方“MYRIAD SHE 从开发主机迁移至本地 Docker”。小程序仍需开发者工具/真机验收。

## 2026-10-19 MYRIAD SHE 从开发主机迁移至本地 Docker

- 按用户确认，仅迁移 MYRIAD SHE 五项服务及其业务数据，不迁移目标主机上的其他 Docker 项目；本机既有 `assetfixed-app` 容器保持运行，未替换其服务或卷。
- 目标主机在 `/opt/myriad-she/migration-backup-20261019-1128/` 留存 PostgreSQL 自定义格式备份、Redis RDB 与 MinIO 数据卷归档，并记录了 SHA-256；同一快照复制至本地被 Git 忽略的 `.migration-backups/192.168.5.99-2026-10-19/`，可用于回退或重做恢复。
- 在本机新建项目专属 Docker 网络及数据卷 `myriad_she_postgres_data`、`myriad_she_redis_data`、`myriad_she_minio_data`，恢复云端数据库、Redis 快照和 MinIO 卷；原远端数据卷没有删除或覆盖。
- 本机 `192.168.1.32` 启动五项服务：PostgreSQL、Redis、MinIO、API、管理后台；远端对应五个 MYRIAD SHE 容器已停止但保留容器、镜像和数据卷以便回滚。远端其他项目均未改变。
- API、管理后台 Docker 镜像构建成功；API 启动时应用 `017_home_issue_meta_typography.sql`，迁移账本最新版本已核验为 017。API、PostgreSQL、Redis 显示健康；API readiness、公开首页、管理后台和 MinIO 健康 URL 均从本机回环与局域网地址验证 HTTP 200。
- 后端 110 项单元测试全部通过；独立后端构建、管理后台 `vue-tsc -b && vite build` 通过。Docker 镜像首次构建耗时主要在下载 Node 基础镜像与管理后台依赖。
- 管理后台 API/CORS/MinIO 公网签名地址及小程序开发 API 地址已由旧服务器改为本机 `192.168.1.32`。微信开发者工具/真机联调尚未执行；真实微信域名白名单、HTTPS 要求和设备所在网络仍需按实际开发环境确认。
- 本机 Compose 项目使用 `.env.local`，远端项目仍保留其原环境文件；敏感变量未写入文档或输出。商店、会员、支付、履约与 mock 配置没有启用或改动。

## 2026-10-21 首页期刊栏目发布链路部署

- 部署范围为本机 `192.168.1.32` 的 MYRIAD SHE 开发联调 Compose；未触碰生产环境、其他 Docker 项目或 PostgreSQL/Redis/MinIO 数据容器。
- 执行前为现有 PostgreSQL 创建了自定义格式快照：`.migration-backups/issue-publication-20261021-140352/postgres.dump`，SHA-256 为 `8A75E5B3925BC0344359BD35554EBEF63CE29FA22DD35949FD0F0C1719239E23`。
- 重建并启动 API 后，迁移执行器自动应用 `047_content_issue_publications.sql`；迁移账本核对显示最新版本为 047，当前 1 个已发布期刊已生成 1 条发布快照，`/api/health/ready` 返回 200。
- 随后重建并启动管理后台；`http://127.0.0.1:61022/` 返回 200。`GET /api/content/home` 返回已发布版本 v1 和有序模块，旧版字段仍保留。当前期刊数据没有封面媒体对象，客户端会展示图片不可用的局部兜底，未擅自更换素材。
- 微信开发者工具 CLI 已登录并成功打开 `miniprogram/` 项目；`cli preview` 两次成功，打包大小 358,597 bytes，预览二维码位于本机临时目录 `C:\Users\UI\AppData\Local\Temp\myriad-she-preview-9ca87ed4cdd047e891bc626faad50993\preview.png`。
- 设备扫码后的真机运行与视觉验收尚未完成，需要现场手机扫描预览二维码；本次没有提交小程序上传或发布。

## 2026-10-19 内容运营二级菜单整理

- 内容运营在左侧后台导航下新增二级菜单，分为“期刊与首页”“实践页面”“媒体维护”。
- 将未引用媒体扫描与安全回收从期刊编辑页面拆出，相关页面内容互斥显示，减少首屏信息拥挤；保留期刊生命周期、媒体保护期及服务端引用复核逻辑。
- 二级菜单具备当前项状态、键盘焦点样式和小屏横向导航布局；未新增或修改 API、数据库迁移及其他产品能力。
- 管理后台 `npm run build`（`vue-tsc -b && vite build`）通过。本次仅更新源码和进度文档，未部署、未重启服务。

## 2026-10-19 内容运营二级菜单部署

- 按用户要求，仅重新构建并重建本机 `myriad_she_admin` 管理后台容器；API、PostgreSQL、Redis、MinIO 及其他 Docker 项目均未重建或重启。
- 容器状态为 `Up`，管理后台 `http://127.0.0.1:61022/` 返回 HTTP 200。

## 2026-10-19 内容运营二级菜单层级修正

- 修正导航 DOM 层级，将“期刊与首页、实践页面、媒体维护”放入“内容运营”菜单项下方的同一导航组，不再显示在全部主菜单最底部。
- 管理后台 `npm run build` 通过；仅重新构建并重启 `myriad_she_admin`，容器状态为 `Up`，页面返回 HTTP 200。
- API、PostgreSQL、Redis、MinIO 及其他 Docker 项目未重建或重启。

## 2026-10-19 实践页参考图还原

- 调整小程序实践页顶部品牌栏、双侧页眉、日常实践标记、主标题/引导语、实践目录分隔和编号列表的字号、间距与对齐，按参考图建立纵向留白与底部导航前的内容节奏。
- 继续读取云端实践文案与目录，不改 API 或数据结构；将现有云端 `intro` 用作主标题，保留标题字段作为“日常实践”栏目的可配置显示名；引导语与列表副文案对应参考图。
- 入口逻辑保持产品边界：仅已启用的“此刻观察”进入观察页；共同实践与日常之物保持关闭，点击明确提示暂未开放。为入口补充禁用状态的无障碍说明，并保留加载、失败重试与请求代次守卫。
- 本次仅修改源码与进度记录；未编译、部署或重启服务。微信开发者工具及真机视觉验收待后续授权后进行。
- 按后续截图反馈移除实践页重复的自绘“MYRIAD SHE ···”栏及其对应自定义弹层，保留原生顶部导航与小程序菜单，避免同一栏重复显示。
- 按目录参考图确认小程序分割线下显示三项实践目录；将后台实践入口文案管理从“实践页面”拆分至“内容运营 > 时间目录设置”二级菜单，实践页面文案独立保留。
- 时间目录设置复用现有管理 API、编辑版本冲突守卫与实践入口契约；可调整目录名称和说明，入口开放状态仍按产品规则锁定（观察开放，其余目录关闭），未启用商店能力。
- 管理后台 `npm run build`（`vue-tsc -b && vite build`）通过；本次未部署或重启，微信开发者工具/真机呈现仍待验证。

## 2026-10-19 管理后台 UI 与交互优化部署

- 沿用 MYRIAD SHE 暖米色编辑风格，增加模块上下文标题、侧栏层级状态、卡片层次、表单焦点反馈和轻量区域进入/悬停动效；动效遵循 reduced-motion 设置，不改变后台数据/API/权限逻辑。
- 管理后台源码构建通过；仅按当前在运行的开发 Compose 配置重建并重启 `myriad_she_admin`，未触碰 API、PostgreSQL、Redis、MinIO 或其他 Docker 项目。
- `myriad_she_admin` 状态为 Up，`http://127.0.0.1:61022/` 返回 HTTP 200，页面标题为 MYRIAD SHE 管理后台。
- 后续按用户要求连同前后端一起更新：仅重建并重启 `myriad_she_admin` 与 `myriad_she_api`；API 容器健康检查通过，`/api/health/ready` 和 `/api/content/practice` 均返回 HTTP 200，管理后台首页 HTTP 200。数据层容器及其他 Docker 项目未重启。

## 2026-10-19 管理后台侧栏与刷新状态优化

- 增加一级菜单收缩/展开按钮；健康与迁移、内容运营、观察治理、隐私申请、审计日志均增加一致的线性图标，收缩时保留可访问名称与提示。
- 内容运营二级菜单取消左侧竖线，展开和切换加入轻量动效；尊重系统减少动态效果偏好。
- 将当前一级和二级菜单写入浏览器本地导航状态，刷新后恢复原分区/页面，不重置到默认首页；异常或未知存储值安全回落默认项。
- 管理后台 `npm run build`（`vue-tsc -b && vite build`）通过。本次仅源码构建检查，未部署或重启服务。
- 后续按反馈为“期刊与首页、实践页面、时间目录设置、我的页面设置、媒体维护”五个二级菜单增加匹配语义的线性图标；二级导航保持展开优先，重复点击一级“内容运营”不会收起，收缩侧栏状态下点选内容运营会直接展开并进入。
- 管理后台 `npm run build` 再次通过；本次仅源码修改与构建检查，未部署或重启。
- 后续按用户要求重建并重启前后端时发现 API 源文件的泛型对象写入触发 TS2862，修正为经 `Record<string, unknown>` 可写视图赋值，未改变运行逻辑；后端 `npm run lint` 通过。
- 修正后仅重建/重启 `myriad_she_api` 与 `myriad_she_admin`；API 健康、后台首页与 API readiness 均 HTTP 200，数据层服务及其他 Docker 项目未重启。

## 2026-10-19 实践目录三行富文本与样式管理

- 实践目录每项明确按情境文案、目录名称、补充说明三行渲染；三行均从云端读取，不再由小程序硬编码情境文案或特殊替换说明。
- “内容运营 > 时间目录设置”为三行分别提供富文本编辑、字号（10–48px）和颜色配置；保存沿用既有编辑版本冲突保护和管理审计。

## 2026-10-19 实践目录增删改与独立折叠

- 时间目录支持新增、修改、删除和调整显示顺序；变更通过既有版本校验接口一次性保存，删除在本地确认后随保存生效，并写入管理审计。
- 后台每个目录独立折叠/展开，新增目录默认展开并保持关闭；折叠控件支持键盘聚焦与状态播报，窄屏下编辑器纵向排列。
- 为满足可变目录数量新增迁移 `023_practice_directory_crud.sql`，允许稳定 slug 标识的目录并放开顺序唯一约束；保留“此刻观察”作为不可删除且必须开放的核心入口，其他目录继续关闭，未改变商店、会员、支付、履约边界。
- API 与小程序公开内容守卫、后台响应守卫均支持 1–100 项目录并校验标识唯一；新增测试覆盖目录增删、顺序保存及原有开放约束。
- 验证：后台前端构建通过，后端 lint/build 通过，后端测试文件串行运行通过。Node 测试 runner 在当前 Windows 沙箱以 `spawn EPERM` 无法启动子进程，因此逐个直接执行编译后的测试文件验证。
- 已按本地工作区部署并重启 API 与管理后台，启动时应用 023 数据库迁移；API `/api/health/ready` 与 `/api/content/practice` 返回 200，管理后台端口返回 200。未重建或重启 PostgreSQL、Redis、MinIO，也未更改任何外部/生产服务。

## 2026-10-19 内容运营实践导航归并

- 内容运营下将实践相关入口归并为“实践”分组，分组内固定展示两个二级菜单：“实践页面”和“实践目录设置”；原“时间目录设置”展示名称统一为“实践目录设置”。
- 两个菜单仍分别对应页面文案和目录增删改/折叠编辑，不改变 API 契约、目录开放约束或用户端公开接口。

## 2026-10-19 实践提升为一级菜单

- “实践”已从“内容运营”中提升为独立一级菜单，位置紧接“健康与迁移”下方；其下保留“实践页面”和“实践目录设置”两个二级菜单。
- 内容运营一级菜单仅保留期刊与首页、我的页面设置、媒体维护；旧版本地导航状态会自动迁移到新的实践一级菜单位置，刷新后仍停留在原实践子页面。
- 后端对富文本进行白名单清洗并校验字号/颜色；新增向后兼容迁移 `021_practice_directory_typography.sql`，为既有三项目录填充当前参考文案与默认样式，不更改入口开放状态。
- 后端 `npm run lint`、构建通过；管理后台 `npm run build` 通过；后端全部单元测试逐文件串行通过（并行测试因 Windows 子进程权限报 EPERM，切换串行运行后通过）。
- 按此前部署偏好，在受控 Docker 访问下仅重建并重启 `myriad_she_api` 与 `myriad_she_admin`；API 启动时成功应用 021 迁移。API readiness、公开实践内容接口和后台首页均返回 HTTP 200；三项目录均返回已初始化的三行文案与样式字段。
- 部署期间未重启或改动 PostgreSQL、Redis、MinIO 等数据层容器，也未触碰其他 Docker 项目。微信开发者工具/真机视觉验收尚未执行。

## 2026-10-19 实践页面说明富文本

- “实践页面”后台的页面说明改为可配置富文本：支持主动换行、加粗、斜体、下划线、局部字号与颜色，以及整段默认字号/颜色。
- 小程序实践页改为读取并渲染云端页面说明富文本；服务端继续执行标签白名单、字符数、字号和颜色约束，不允许脚本、链接、图片等不安全内容。
- 新增向后兼容迁移 `025_practice_page_intro_typography.sql`，既有页面说明自动填充为富文本默认值；随后用 `026`、`027` 归一化历史异常空白，保留原 `intro` 字段用于兼容与纯文本摘要。
- 已完成后端 lint、build 与 117 项单元测试，管理后台 build 通过；随后按既定偏好重启 API 与管理后台，未重启 PostgreSQL、Redis、MinIO。

## 2026-10-19 实践页页眉配置

- “实践页面”后台新增左右页眉编辑，默认值分别为“实践”和“此刻归安”；两侧独立支持富文本、主动换行、字号与颜色。
- 小程序实践页页眉改为读取云端配置并按富文本样式渲染，默认排版继续左右分置；后端复用现有白名单清洗、长度/字号/颜色校验、编辑版本冲突与审计机制。
- 新增向后兼容迁移 `028_practice_page_meta_typography.sql`；既有期刊、实践入口及商店/会员/支付/履约边界不变。
- 后端 lint、build、118 项单元测试通过；管理后台 `vue-tsc -b && vite build` 通过。部署/重启结果见下方实际验证。
- 本机 Docker 已重建并重启 `myriad_she_api` 与 `myriad_she_admin`，API 启动时成功应用 028 迁移；管理后台首页、API readiness 与公开实践配置均返回 HTTP 200，API 状态 healthy。
- 仅重建前后端服务；PostgreSQL、Redis、MinIO 和其他 Docker 项目未重启。小程序源代码已更新，但微信开发者工具/真机编译验收未执行。

## 2026-10-19 实践页面标题配置

- “实践页面”顶部栏目标题也改为可配置富文本，支持主动换行、加粗、斜体、下划线、字号和颜色；默认显示“日常实践”。
- 新增向后兼容迁移 `029_practice_page_title_typography.sql`，旧 `title` 字段继续保留为纯文本摘要和兼容字段；未新增用户端公开接口。
- 本机 Docker 已重建并重启 `myriad_she_api` 与 `myriad_she_admin`，API 启动时成功应用 029 迁移；实践内容接口返回标题富文本默认值，API readiness 与管理后台首页均返回 HTTP 200。

## 2026-10-19 暂停期刊入口

- 按用户确认仅停用入口：小程序首页移除期刊封面、期号、主题、微声音与本期目录，改为通用观察和实践入口；观察启动不再自动携带期刊问题。
- 管理后台隐藏首页期刊一级入口并移除期刊编辑表单/概览卡片；保留服务端期刊 API、数据库历史数据、观察记录中的历史期刊筛选与媒体引用保护，不删除或归档任何记录。
- 管理后台构建通过，后端 lint/build 与 119 项单元测试通过；本机仅重建并重启 API 和管理后台，ready、首页接口、实践接口及后台首页均返回 HTTP 200，API healthy。
- PostgreSQL、Redis、MinIO 与其他 Docker 项目未重启；小程序源码已更新但未发布到微信平台。

## 2026-10-19 实践目录观察入口还原

- 点击“实践目录 > 此刻观察”继续进入原有观察流程，但选择态按参考图重排为“从现实处境开始”和“从四时气韵开始”两段入口，并保留四步填写、自动保存、草稿恢复、冲突处理和账户代次隔离。
- 补充入口说明、主动换行、隐私提示与“了解四时气韵”说明弹层；两个入口动作使用带可访问角色的自绘 `view`，观察页不再使用小程序原生 `button`。
- 延续既有页面米色背景、棕红色、Georgia 衬线与字号层级；不新增 API、数据库迁移或观察数据字段。

## 2026-10-20 此刻观察入口内容后台管理

- 管理后台“实践”一级菜单下增加“内容管理 → 此刻观察”，刷新后仍恢复到该子页面；与实践页面、实践目录共用现有乐观并发版本保护和审计记录。
- 后台可分别修改入口页眉、标题、说明、现实处境/四时气韵路径文案、按钮文字及隐私提示；编辑器支持富文本、主动换行、字号和颜色。
- 小程序观察方式选择页改为读取既有公开实践内容接口，页面控件和流程逻辑不变；请求失败时使用内置默认文案。答案、草稿与观察正文不进入后台配置。
- 新增向后兼容迁移 `031_practice_observation_copy.sql`，将入口配置作为实践页面的一部分保存；后端沿用现有富文本白名单清洗，未新增用户端 API，也未启用商业功能。
- 后端 lint/build 与 120 项单元测试、管理后台 build 已通过。首次部署发现历史数据库中的 030 迁移校验和与工作区文件不一致；保留账本原值，仅对该明确历史校验和增加兼容识别，并以幂等的 032 迁移补齐目录约束变更，未修改数据库账本；原有共享实践迁移顺延为 034。随后已按既定偏好重建并重启 API 与管理后台：API readiness、公开实践配置接口和管理后台首页均返回 HTTP 200，API healthy；PostgreSQL、Redis、MinIO 与其他 Docker 项目未重启。小程序仍需开发者工具/真机验收。

## 2026-10-27 生产域名切换

- 生产前端、API、CORS、MinIO 公网地址及小程序正式环境 API 统一切换为 `https://hszfckga.com`，`www.hszfckga.com` 重定向到主域名。
- 网关改用服务器 `/data/hszf/hszfckga.com_bundle.crt` 与 `/data/hszf/hszfckga.com.key`；证书 SAN 与生产域名一致。
- 目标服务器 `118.25.227.159` 已同步源码并重建 API/管理后台镜像，通过镜像导入绕过 Docker Hub 网络超时后完成 gateway、admin、api 重启；公开首页、就绪探针和实践接口均返回 HTTP 200。
- Compose 因依赖镜像刷新同时重建 PostgreSQL 与 MinIO 容器，但沿用原数据卷，Redis 未重启；未清理或迁移任何业务数据，也未触碰其他 Docker 项目。

## 2026-10-27 网站备案信息展示

- 管理站点统一页脚展示备案号，链接至工信部备案查询平台；登录页、密码修改页和后台页面均可访问。最初展示“粤ICP备2026044906号”，当日按最新备案口径更正为“蜀ICP备2026044906号-1”，外链地址保持不变。
- 外链使用新窗口及 `noopener noreferrer`，页脚支持键盘聚焦，适配窄屏安全区域。
- 仅修改前端，不新增 API、数据库迁移或业务配置；完成前端构建后仅更新生产管理后台容器，数据库及其他服务保持运行。

## 2026-10-27 生产管理后台发布（备案号更正）

- 生产服务器 `118.25.227.159`，项目目录 `/opt/myriad-she`，Compose 项目 `myriad_she_prod`。发布前比对确认服务器源码与本地 `management/` 仅差备案页脚一处，据此以本地源码覆盖同步。
- 该服务器无法直连 Docker Hub（`registry-1.docker.io` 超时），改用镜像站 `docker.m.daocloud.io` 拉取 `node:22-alpine` 并在本地打标，再按仓库内 `management/Dockerfile` 正常构建；npm 源可直连，`npm ci` 正常。
- 仅执行 `docker compose build admin` 与 `up -d --no-deps admin`，api、PostgreSQL、Redis、MinIO、gateway 容器启动时间未变。发布后 `https://hszfckga.com/` 与 `/api/health/ready` 均返回 200，线上 bundle 已包含 `蜀ICP备2026044906号-1`。
- 回滚方式：源码备份 `/opt/myriad-she/.backup/management-20261027-160938.tar.gz`，镜像标签 `myriad-she-admin:pre-filing-20261027-160938`，重新打标后 `up -d --no-deps admin` 即回到发布前状态。
- 小程序端 `pages/mine` 的重构不经过服务器发布，仍需在微信开发者工具中上传版本并提交审核后方可生效。

## 2026-10-27 管理后台界面重构（统一样式系统）

- 问题定位：`management/src/style.css` 先后叠加过三套主题，最后一层用 `#dashboard-content :where(*)` 把所有文字强制为同一颜色与衬线体，且 `--admin-muted` 与 `--admin-ink` 同值，导致整站发灰、层级消失。
- 处理：删除后两层互相覆盖的主题（约 130 行）与全局压平规则，新增统一主题层，用一套 token 管理画布、卡片、边框、墨色、辅助文字、强调色与状态色；界面正文改用系统无衬线体，标题与数字保留衬线体。
- 统一了侧栏导航选中态、顶栏、卡片、表格（表头/行悬停/分隔线）、按钮（主要/次要/危险/禁用/聚焦）、表单控件、状态徽标、登录卡片与弹层。
- 仅修改 `management/src/style.css`，未改动任何模板、脚本、后端 API 与小程序；改动前后的类名集合一致（脚本比对 257 个类，无丢失），未使用的 `--admin-*` 变量已清除。
- 重新构建并只更新 admin 容器；线上 `https://hszfckga.com/` 返回 200，产物中不再含旧覆盖规则，备案号保持 `蜀ICP备2026044906号-1`。回滚：镜像 `myriad-she-admin:pre-redesign-20261027-161643`，服务器源码备份 `/opt/myriad-she/.backup/style.css.20261027-161643`。

## 2026-10-27 管理后台界面重构 v3（现代 SaaS 版）

- 新增 `management/src/admin-theme.css` 作为唯一主题层，在 `style.css` 之后由 `main.ts` 导入，覆盖旧主题但**不改动** legacy 组件样式，回滚只需移除该文件。
- 视觉体系：单一陶土强调色配中性灰阶；标题与正文统一无衬线并按 26/19/15 三级收敛；圆角 14/10、1px 描边、两级极轻阴影；表格表头小字大写、行悬停；按钮区分主要/次要/危险/禁用/聚焦。
- 动效：160ms 缓动，仅用于悬停、聚焦、区块进入与弹层出现；`prefers-reduced-motion` 下全部关闭。
- 新增「回到顶部」：滚动超过 480px 出现，`onBeforeUnmount` 移除监听。
- 响应式：≤1100 / ≤900 / ≤640 三档；≤900 时侧栏转为顶部横向可滑动导航，表格容器横向滚动，页面不产生横向溢出。
- 本地验证路径：本地 admin 为 compose 的 development 目标，挂载 `./management` 并由 Vite 提供服务，改动经热更新即时生效；生产镜像已用新源码构建但**未重启容器**，线上仍为上一版。

### v3 验证与修复（同日）

- 验证方式：无头 Chrome 渲染本地站点，并用同源探针页在 360/390/430/768/1024/1440 等宽度读取 `clientWidth`／`scrollWidth` 与关键元素矩形，覆盖登录页、总览、观察记录页与移动端布局。
- 修复 1：`style.css` 中残留的上一版主题层（约 490 行）权重更高，一直覆盖新主题（例如 `.dashboard-workspace .section-heading h2` 把字号拉回 22px）。已整段移除，`style.css` 现为 527 行纯组件样式。
- 修复 2：`.shell` 的 `margin: 0 auto` 在 column flex 父级里会让元素收缩成内容宽度，登录页外壳因此只有 345px。改为 `width:100%`，并对 `.shell.dashboard-shell` 显式恢复全宽。
- 修复 3：`.panel strong`／`.panel p` 的字号规则误伤期刊列表与说明文字（列表标题 22px、说明段落 22px 衬线），已限定为面板数值字号，卡片内标题回到 14px。
- 修复 4：移动端 `.dashboard-layout` 的 `align-content: stretch` 把导航行撑到 263px，形成一条白色空白带；单列时改为 `align-content: start`。
- 修复 5：窄屏下板块标题与统计说明同排导致标题换行、按钮被压成竖排；≤720px 改为纵向排列并给按钮 `white-space: nowrap`。
- 结果：390／768／1440 三档均无页面级横向溢出（`scrollWidth == clientWidth`），表格在窄屏于容器内横向滚动、桌面自适应；截图存于 `docs/screenshots/`。

## 2026-10-27 www 域名直接访问

- 原生产网关将 `www.hszfckga.com` 的 HTTPS 请求永久重定向至裸域名，导致无法保留 www 地址访问。
- Nginx 配置调整为两个 HTTPS 主机名共用站点；HTTP 升级 HTTPS 时保留原主机名。API 和 MinIO CORS 来源增加 www 域名，README 说明两个地址都可访问。
- 已发布到生产服务器 `118.25.227.159`：备份原 Nginx 与 `.env.production` 配置后，更新 gateway 和 MinIO。线上 `https://www.hszfckga.com/` 与 `/api/health/ready` 均返回 200，MinIO 对 www 来源的 CORS 预检返回 204 并回显允许来源；服务器本机 HTTP 返回 301 到 `https://www.hszfckga.com/`。API、管理后台、PostgreSQL、Redis 未重启，API 与数据库保持 healthy。服务器配置备份为 `/opt/myriad-she/.backup/myriadshe.conf.www-enable-20261027-1725` 和 `/opt/myriad-she/.backup/env.production.www-enable-20261027-1725`。

## 2026-10-27 商城总闸接入（store_enabled 生效）

- 问题：后台「系统设置 → 商城开放」只把 `system_settings.store_enabled` 存库，小程序从未读取；前端实际只按实践入口 `daily-goods` 判断，导致后台显示“未开放”而日常之物仍在售。
- 后端新增 `GET /content/store-status`，返回 `{ open }`；`isStoreOpen()` 用一条查询同时读取 `store_enabled` 与 `content_practice_entries` 中 `daily-goods` 的 `enabled`，两者皆真才为开放。
- `GET /content/daily-objects` 在未开放时返回 `products: []`，不再下发商品价格与图片签名地址，页面文案仍保留供落地页使用。
- 小程序：列表页与详情页均改为校验总闸；关闭时列表走“尚未开放”落地页、详情页提示“日常之物尚未开放”。`isDailyObjectsContent` 放开商品数量下限，否则关闭态的空数组会被判为格式无效。
- 后台说明文案同步更新，明确“总开关 + 实践入口”两层依赖关系。
- 验证：后端 `tsc --noEmit` 通过；单元测试新增 5 项（总闸三种组合 + 商品下发两种状态），共 169 项全部通过；本地接口实测关闭时 `open=false`／商品 0 条，临时开启后 `open=true`／商品 2 条，随后已还原为关闭。
- 发布顺序：先发后端（新增接口），再上传小程序版本；若小程序先上线，接口 404 会让页面按“未开放”降级处理。

## 2026-10-27 观察页顶栏标题（仅“从现实处境开始”流程）

- 观察页使用 `navigationStyle: "custom"`，顶栏由页面自绘（`.observation-nav-title`），此前该处写死“此刻观察”；页面内 `wx.setNavigationBarTitle` 在自定义导航下并不显示。
- 改为数据驱动 `navTitle`：选择或恢复“从现实处境开始”时显示“从现实处境开始”；四时气韵、选择方式页与重新开始等其余状态一律维持原来的“此刻观察”，本次只改这一条流程。
- `pages/observation/index.json` 的 `navigationBarTitleText` 维持原值不变；`index.ts` 语法检查通过。

## 2026-10-27 此刻观察选择页：去掉分割线与标题断行

- 去掉 `.choice-meta`（此刻归安 / PRIVATE PRACTICE）下方的 1rpx 分割线，改为仅留上内边距。
- `observationCopy.introTitle` 改为在自然停顿处断行：`先把正在发生的事，<br/>放在眼前。`，同时去掉原先内容末尾遗留的多余 `<br/>`（后台富文本把段落转行时留下的），避免多出一个空行。原先 54rpx 字号下每行塞满 12 字，会把“眼前”拆成“眼／前。”。
- 同步更新后端 `defaultObservationCopy` 与小程序内置兜底文案；本地内容经 `PATCH /content/practice/manage` + `POST /content/practice/manage/publish` 发布（edit_version 22 → 23）。
- 事故与恢复：首次提交时 PowerShell 以非 UTF-8 编码发送请求体，导致实践内容整份写成 `????`（标题、说明、入口文案与 observationCopy 全损）。随即用生产库同版本数据（`content_practice_page` / `content_practice_entries`，edit_version 22，与本地损坏前一致）通过 `pg_dump --data-only --column-inserts` 导出、事务内清空并导入，逐字段核对中文恢复正常；随后改用 `[System.Text.Encoding]::UTF8.GetBytes()` 字节体重提，内容正确。
- 经验：调用后台写接口提交中文时，一律以 UTF-8 字节数组作为请求体，或显式设置 `Content-Type: application/json; charset=utf-8` 并使用字节体；不要依赖 PowerShell 对字符串请求体的默认编码。

## 2026-10-27 “先了解四时气韵是什么”改为自定义底部弹层

- 原先点击该入口调用 `wx.showModal`，样式不可控。改为页面内自绘底部弹层：遮罩 + 圆角纸面 + 四瓣花标记 + 眉题 + 标题 + 两段说明 + 主次按钮。
- 交互：点遮罩关闭（`catchtouchmove` 阻止背景滚动）；「进一步了解」进入四时气韵流程；「先从现实处境开始」进入现实处境流程；`restart()` 会重置弹层状态。
- 重构：把选择方式的逻辑从 `beginMethod` 抽为 `startMethod(method)`，弹层按钮与原有入口共用，避免重复。
- 文案沿用图片版本：标题「四时气韵是什么？」，两段说明分别为生命牌线索与“不是测试、也不定义你”。
- 校验：`index.ts` 语法检查通过；WXML `view` 标签 132/132 配平；WXSS 花括号 116/116；用真实 WXSS 转 CSS 在 390px 视口渲染预览，确认遮罩、纸面、按钮层级与参考图一致。

- 图标改为独立 SVG：`miniprogram/assets/brand/flower-mark.svg`（四瓣风车、中心留白），弹层里由 4 个 CSS 方块拼的水平十字换成 `<image mode="aspectFit">`，尺寸 44rpx。CSS 中对应的 `nth-child` 花瓣规则已删除。

- 图标二次调整：花瓣加大到 `rx 13 / ry 17.5`、中心外移（`cy 25.5`）以保留四瓣之间的缝隙；弹层显示尺寸由 44rpx 提到 56rpx，视觉分量对齐参考图。

## 2026-10-27 四时气韵入口页（照图还原）

- 新增整页 `pages/season-intro`：自定义顶栏（‹ / 四时气韵 / ···）、页眉（四时气韵 / 从生命牌开始）、标题「从一个生日，开启一次观察。」、说明文案、公历生日「月 / 日」两个选择器、提示、本机记住生日、主按钮「查看我的生命牌」、分割线、可折叠说明、次按钮「从现实处境开始」、文字入口「暂不使用四时气韵」、底部 tab（实践高亮）。
- 交互：月选择会按月份收敛可选天数（2 月 29 天、30/31 天月份自动裁剪）；记住生日用 `wx.setStorageSync('myriad_she_season_birthday')`，未勾选则清除。
- 跳转：观察页说明弹层里的「进一步了解」改为 `navigateTo('/pages/season-intro/index')`；入口页「查看我的生命牌」带 `method=season&birthMonth&birthDay` 进入观察页并直接落到「写下现实经验」步骤（生日已采集，不再重复填写）；「从现实处境开始」带 `method=reality` 进入。
- 观察页新增 `applyEntryMethod()` 处理入口参数；年份按 2000 拼装仅为满足服务端日期格式校验，`SEASON_SAVE_BIRTH_DATE` 未开启时生日不会落库。
- `app.json` 注册新页面；`app-tab-bar` 增加该路由的选中映射（实践）。
- 校验：两处 TS 语法通过、JSON 有效、WXML `view` 31/31、WXSS 花括号 39/39；用真实 WXSS 转 CSS 在 390px 视口渲染整页，与参考图逐块比对一致。

### 说明折叠区调整（同日）

- 文案替换为：生命牌来自一种以生日对应纸牌的传统符号体系…… + 生日只用于查表…… + 「底色 → 此刻 → 选择 → 行动」三段。
- 修复布局：说明正文原用 `display:grid` 承载两段并带半透明底块，视觉上出现“底色多一块、字距被拉伸”。现改为无底色的两段正文（`text-align: left`、`letter-spacing: 0`、行高 1.95），步骤行单独一行。
- 折叠区与下方「从现实处境开始」「暂不使用四时气韵」的间距保持不变。

- 折叠行（生命牌与四时气韵是什么？）整体放大：字号 26rpx → 31rpx，箭头 22rpx → 26rpx，行高与点击区域 84rpx → 104rpx，箭头与文字间距 12rpx → 16rpx，并补按压态。

## 2026-10-28 生命牌（按生日的底色）文案 + 后台维护

- 数据：新增迁移 `052_life_cards.sql` 建 `content_life_cards`（month/day/suit/rank/theme/title/summary/prompt），按公历播种 **366 条**（含 2/29）。牌面规则：1 月 1 日 = 4♠，花色 ♠♥♣♦、点数 4..K A 2 3 循环，故 1 月 12 日 = 2♠（与设计稿一致）。
- 迁移 `053_life_cards_updated_by_text.sql`：把 `updated_by` 由 uuid 改为 text。开发管理员令牌里的身份是 `admin:admin` 这类非 UUID，原类型写入时 500。
- 接口：公开 `GET /content/life-card?month=&day=`；后台 `GET /content/life-cards/manage`（返回 366 条）与 `PATCH /content/life-cards/manage/:month/:day`（校验花色/点数/文案长度，写入审计 `content.life_card.updated`）。
- 小程序：四时气韵流程第 1 步「底色」改为展示生命牌——步骤条统一为 01 底色 / 02 此刻 / 03 选择 / 04 行动；卡片区显示牌面（如 2♠）、`x 月 x 日`、修改生日、`MYRIAD SHE · 底色观察`、标题、说明、`可以留意 · 主题`、观察提示与脚注，数据取自当天接口。
- 后台：新增「生命牌文案」分区（超级管理员可见），12 个月份切换 + 按天列表 + 当日编辑器（花色、牌面、主题标签、标题、说明、观察提示），保存后立即生效。
- 验证：后端 `tsc` 通过、169 项单测全通过；`GET`/`PATCH` 实测（改 Q♥ 再还原为 2♠）与公开接口一致；后台 `vue-tsc + vite build` 通过并截图确认列表与表单渲染。
- 待补：366 条文案目前均为同一份占位文案（`在靠近中，听见自己`），需运营在后台逐日填写；牌面映射若与产品既有规则不同，可按天在后台修正或告知我按新规则重播。

- 修复「查看我的生命牌」跳过后直接进入「写下现实经验」的问题：`applyEntryMethod` 早期为避免重复填生日把 `step` 设为 1，第 0 步改为生命牌展示后这条跳过会盖掉卡片页。现保留 `step: 0`，由用户点「下一步」进入下一步。
- 四时气韵流程顶栏标题统一为「四时气韵」（原为「此刻观察」），与设计稿一致。
- 选择方式页点「从四时气韵开始」改为跳转生日入口页（第 0 步已无生日输入，避免出现空白卡片）。
- 第 0 步补兜底：无生日时显示「还没有选择生日」与「选择生日」入口。

- 生命牌页补充三段内容（对齐设计稿）：分割线 + 「传统线索 · 注」（按花色/点数生成，可后台逐日改写）+ 可展开的「释义来源与使用说明」（引用 Robert Camp《Love Cards》页码与使用边界说明）；第 1 步主按钮文案改为「回到一件真实的事」。
- 数据：迁移 `054_life_cards_note.sql` 新增 `note` 字段并按「花色含义 + 点数含义」批量生成初始文案；接口 `GET /content/life-card`、后台列表与 `PATCH` 均返回/接受 `note`。
- 后台「生命牌文案」表单新增「传统线索 · 注」多行输入（上限 400 字）。
- 修复：PATCH 的 UPDATE 语句漏加 `note` 占位符导致参数个数不匹配（10 vs 9）返回 500，已改为 `note = $9, updated_by = $10`。
- 验证：`tsc` 与后台构建通过；实测改「传统线索」再还原、列表返回 `note` 正常；渲染确认三段内容与设计稿一致。
- 已知不一致：来源说明里写「2 月 29 日对应 9♣，12 月 31 日对应 Joker」，但当前播种的牌面表（52 张循环）给出的是 2/29 = J♠、12/31 = 5♠；需要按原书生日表重播或逐日修正。

- 返回箭头统一放大：此前各页字号从 34rpx 到 54rpx 不等（观察页与四时气韵入口页最小），现统一为 **56rpx**。涉及 14 个页面的样式，另 2 个页面（联系支持、日常之物详情）通过 `@import "../daily-objects/index.wxss"` 复用同一份 `.shop-topbar-action`，一并生效。
- 说明：若严格按“放大 100%”，观察页 34rpx → 68rpx；但已有页面最大 54rpx，全部翻倍会到 108rpx 并撑破 56px 高的导航栏，故取统一的 56rpx。需要更大时改这一个数值即可。

- 四时气韵入口页：去掉「四时气韵 / 从生命牌开始」页眉下方的分割线（`.season-meta` 的 `border-bottom`），页眉下内边距 22rpx → 6rpx，标题区上间距 54rpx → 44rpx。
- 主标题改为两行块级结构：「从一个生日，」/「开启一次观察。」各自成行（`.season-headline-line { display: block }`），避免不同机型上换行位置漂移。

## 2026-10-28 生命牌查看记录（后台可查）

- 数据：迁移 `055_life_card_views.sql` 建 `life_card_views`（用户、月、日、花色、点数、查看时间），带 `viewed_at` 与 `(user_id, viewed_at)` 索引；用户删除时级联清理。
- 上报：小程序在生命牌加载成功后调用 `POST /content/life-card/view`（`UserAuthGuard`，需登录），每个页面实例只上报一次，失败静默不影响展示。
- 后台：`GET /content/life-card-views/manage`（管理员）分页返回记录并联表 `users.nickname`；新增「生命牌查看」分区，表格展示 用户 / 生日 / 牌面 / 查看时间，支持「加载更多」。
- 校验：`tsc` 通过、169 项单测全通过；接口实测未登录返回 401、后台列表正确返回昵称/牌面/时间；后台页面截图确认渲染（列表通过 localStorage 恢复分类进入时也能自动加载）。
- 说明：目前不做去重，用户每次进入「底色」并成功看到卡片即留一条；如果希望同一用户同一天只记一次，或需要按日期/用户筛选与导出，可以再加。

## 2026-10-28 生命牌：逐日释义来源、查看记录筛选、导入导出（按序交付）

### 1. 释义来源与使用说明（每天一条）
- 迁移 `056_life_cards_source_note.sql`：`content_life_cards` 新增 `source_note`，按原静态文案播种（含「数字 N」随牌面替换），段落以空行分隔。
- 接口 `GET /content/life-card`、后台列表与 `PATCH` 均返回/接受 `sourceNote`（上限 2000 字）。
- 小程序改为读取当天 `sourceNote`，按空行拆段渲染；不再写死文案。
- 后台表单新增「释义来源与使用说明」多行输入。

### 2. 查看记录筛选
- `GET /content/life-card-views/manage` 支持 `from`／`to`（按东八区日期）、`user`（昵称或用户 ID 模糊）、`suit`、`rank` 组合筛选，总数与分页同步过滤。
- 后台「生命牌查看」新增筛选栏：开始/结束日期、用户关键词、花色、牌面 + 查询/重置。

### 3. 导入导出
- `GET /content/life-cards/manage/export`：导出 366 天 CSV（含 BOM，字段带引号转义，支持多行文本）。
- `POST /content/life-cards/manage/import`：解析 CSV（支持引号、字段内换行、`""` 转义），按 month/day 更新，非法行跳过并回报数量，写审计 `content.life_cards.imported`。
- 后台「生命牌文案」新增「导出 CSV」「导入 CSV」按钮；导入完成后自动刷新列表。

### 验证
- 后端 `tsc` 通过、169 项单测全通过。
- 筛选实测：无筛选 3 / 花色 1 / 点数 1 / 用户 3 / 近 4 天 2 / 组合 1。
- 导入导出实测：导出后原样导入更新 366 条跳过 0；改标题导入生效并已还原。
- 后台两页截图确认渲染（筛选栏、导入导出按钮、新字段）。

## 2026-10-28 后台宽屏留白与生命牌文案页排版

- 问题：`.dashboard-workspace` 使用 `max-width: 1180px; margin: 0 auto`，在 1912px 等宽屏下内容居中，侧栏与内容之间出现约 230px 空白。
- 处理：改为左对齐（`margin: 0`）并把上限放宽到 1440px，内容紧贴侧栏；宽屏只在右侧保留少量留白。
- 生命牌文案页宽屏优化（≥1400px）：日列表固定 190–280px、表单上限 1040px 且改为两列（标题／说明、观察提示／传统线索并排，释义来源整行），列表高度改为 `calc(100vh - 260px)`，纵向滚动明显减少。
- 校验：后台 `vue-tsc + vite build` 通过；1912×948 截图确认「员工与权限」与「生命牌文案」两页左侧空白消失、表单两列排版正常。

- 生命牌文案页精简：删除顶部「LIFE CARDS / 生命牌文案 / 说明」整行（页面标题已在顶栏），并把「导出 CSV」「导入 CSV」移到月份标签行右侧（同一行，窄屏自动换行）。

- 顶栏「退出」由文字按钮改为右上角的圆形图标按钮（38px、描边圆形、登出图标），保留 `aria-label`／`title`「退出登录」，悬停为浅陶土底。

## 2026-10-28 后台右上角账号菜单

- 顶栏改为头像按钮（圆形、显示账号首字母），点击展开下拉菜单；点击遮罩或再次点击头像关闭。
- 菜单内容：身份区（账号名 + 角色：超级管理员／内容编辑／客服只读）、修改密码、退出登录。
- 修改密码：复用 `PATCH /admin/me/password`，弹窗内校验当前密码、新密码至少 12 位、两次一致；成功后更新令牌与过期时间并提示「密码已更新」，失败展示后端信息。
- 身份信息从 JWT payload 解析（displayName／username／sub，去掉 `admin:` 前缀），不额外请求接口。
- 「刷新当前页」保持为独立按钮，不放入账号菜单（页面级操作而非账号操作）。
- 校验：后台 `vue-tsc + vite build` 通过；截图确认头像、下拉菜单（admin／超级管理员／修改密码／退出登录）与修改密码弹窗渲染正常。

## 2026-10-28 顶栏「刷新当前页」按页面类型显示

- 问题：刷新按钮原先在所有分区都显示，但在编辑型页面上点击会静默丢弃未保存内容（此前只有「系统设置」「实践文案」做了二次确认，期刊、法律文档、生命牌文案等没有）。
- 处理：新增 `pageRefreshAvailable` 计算属性，只在一「读」为主的页面显示刷新：健康与迁移、观察记录管理、隐私申请、用户经历审核、审计日志、会员列表、员工与权限、生命牌查看。
- 内容运营（期刊／我的页面／媒体／日常之物／法律文档／关于历史）、实践各编辑页、系统设置、生命牌文案改为不显示刷新——这些页面用「保存」，改动前请先保存。
- 「修改密码」「退出登录」仍在右上角头像菜单中，不受影响。
- 校验：后台构建通过；截图确认「生命牌查看」保留刷新按钮、「生命牌文案」仅剩头像。

## 2026-10-28 顶栏精简：移除刷新按钮与模块说明文字

- 移除顶栏「刷新当前页」按钮（含 `pageRefreshAvailable` 计算属性）；`refreshCurrentPage` 函数保留但已无入口，后续可一并清理。
- 移除各分区标题下的纯说明性文案共 11 处：期刊内容、实践目录、观察文案、共同实践、日常之物、关于页面、发布历史、我的页面、会员列表、系统设置等。
- 保留含实时计数的统计行（观察记录、隐私申请、审计日志、生命牌查看），因其承载数据而非说明。
- 校验：后台构建通过；截图确认会员列表说明消失且顶栏仅剩头像，观察记录页统计行仍在。

- 按「都删掉」继续移除：观察记录、用户经历审核、隐私申请、审计日志、生命牌查看 5 处标题下的统计行（原含实时计数），以及 3 段 `lifecycle-policy` 合规提示（观察记录 2 段、用户经历审核 1 段）。
- 页面标题区现在只剩「眉题 + 标题 +（右侧操作按钮）」，随后直接进入筛选与列表。
- 注意：被移除的 3 段包含「观察内容含个人信息 / 每次查看记审计日志」「草稿治理不自动清理」「保存的经历加密存储」等合规表述，如需保留管理员提示，可只回退这 3 段。

## 2026-10-28 移除页面内重复的第二栏标题

- 问题：每个分区在顶栏大标题之下又重复一次「眉题 + 同名标题」（如顶栏「观察记录管理」+ 区块「OBSERVATIONS / 观察记录管理」），信息重复且占高度。
- 处理（纯 CSS，不改模板）：`​.content-area > .section-heading > div:first-child { display: none }` 隐藏重复标题；`:not(:has(.section-tools))` 让没有操作按钮的整行隐藏。带操作按钮的页面（观察记录「扫描并保护历史答案」、用户经历审核「刷新」、隐私申请「刷新申请」）保留一行右对齐操作。
- 同时收紧该行间距：取消下边框、`padding-bottom: 0`、`margin-bottom: 10px`，`.content-area` 上边距 28px → 20px。
- 校验：构建通过；截图确认会员列表、观察记录、用户经历审核三页均从顶栏标题直接进入筛选/列表，无重复标题。

- 备案号页脚改为仅登录页显示：`<footer v-if="!loggedIn" class="filing-footer">`，登录后的所有后台页面不再出现备案信息。

- 弹层修复：遮罩由 `rgba(23,24,26,.34)` 调淡为 `.22`（此前叠加后接近黑色）；`.observation-detail-panel > .section-heading` 改为吸顶（`position: sticky; top: 0`，带面板底色），滚动到弹层底部时「关闭」按钮仍可见——会员详情原先前述问题即头部随内容滚出视野。

- 弹层遮罩二次修正：根因是 legacy `style.css` 里的 `backdrop-filter: blur(1px)` 叠加旧深色底，在密集表格上糊成灰黑色块。现以 `#dashboard-content .observation-modal-backdrop` 高优先级覆盖为 `rgba(20,22,24,.16)` 并 `backdrop-filter: none`。
- 弹层头部保持吸顶，滚动到底部「关闭」仍可见。若浏览器仍显示旧样式，需硬刷新（Ctrl+F5）清掉缓存的 CSS 模块。

- 弹层头部遮挡的真正根因：`.observation-detail-panel` 为 `display: grid`，grid 子项上的 `position: sticky` 只在自身网格区域内生效，等于失效；再叠加 `padding-top: 26px`，滚动时头部被裁掉一半。
- 修复：面板改为 `display: block`（间距用 `> * + * { margin-top: 16px }` 复刻），`padding-top: 0` 让吸顶头部贴住顶端，头部自带 22px 上内边距与下边框，`z-index: 3`。
- 覆盖范围：全部 5 个弹层共用 `.observation-modal-backdrop` + `.observation-detail-panel`（会员详情、观察记录内容、经历详情、创建员工账号、修改密码），因此一次修复全部生效。
- 校验：截图确认「记录内容」与「会员详情」两个弹层滚动到底部时头部与「关闭」按钮完整可见，遮罩为浅色。

- 针对「硬刷新后弹层头部仍消失」：把弹层相关修复抽到独立文件 `management/src/admin-fixes.css`（main.ts 中在 admin-theme.css 之后引入）。新文件 = 新 URL，可绕开浏览器对旧 CSS 模块的缓存。
- 该文件用 `!important` 强制：遮罩 `rgba(20,22,24,.16)` 且取消 blur；`.observation-detail-panel` 为 `block`；`> .section-heading` 强制 `display:flex` + `position:sticky; top:0`；并显式恢复弹层内标题（避免被「隐藏重复标题」规则误伤）。
- 实测：诊断脚本确认 `panel.display=block`、头部 `position=sticky/top=0`、`head top=10 h=86`；截图确认会员详情与观察记录内容两个弹层头部与「关闭」按钮均正常。
- 若仍异常，需确认访问的是本机 `http://192.168.1.32:61022/`（生产站仍是旧构建）并尝试无痕窗口。

- 在 `http://192.168.1.32:61022/` 上以全新浏览器配置加载并注入诊断，实测结果为：`panel.display=block`、`header.display=flex`、`backdrop=rgba(20,22,24,0.16)`，即 `admin-fixes.css` 已生效、弹层头部正常显示。
- 结论：服务端产物正确，用户端看到旧样式属于浏览器仍运行旧模块（容器重启会断开 Vite HMR，已打开的页面需整页重载）。`vite.config.ts` 已尝试加 `Cache-Control: no-store`（Vite 自身仍返回 no-cache）。

- 弹层改为「头部固定 + 内容区独立滚动」的结构方案（不再依赖 `position: sticky`）：
  - 模板：5 个弹层在 `.section-heading` 之后新增 `<div class="panel-body">` 包裹其余内容。
  - 样式（admin-fixes.css）：面板 `display:flex; flex-direction:column; overflow:hidden; padding:0`；头部 `flex:0 0 auto`；面板体 `flex:1 1 auto; min-height:0; overflow-y:auto`。
- 实测：`panelOverflow=hidden`、`headTop=43 == panelTop=42`、`bodyScroll=121/423`，滚动内容时头部与「关闭」按钮完全不动。
- 相比于 sticky 方案，此结构在任意浏览器下都不会出现头部滚出视野的情况。

## 2026-10-28 弹层重构：Teleport 到 body 的独立大窗口

- 根因（终于定位）：`.content-area` 带 `animation: section-in … both`，关键帧包含 `transform`，使该元素成为 **fixed 定位的包含块**。弹窗虽然写了 `position: fixed; inset: 0`，实际被限制在 `.content-area` 盒子内——所以遮罩只盖住内容区、面板被裁切、`panelTop` 出现负值。
- 处理 1（结构）：5 个弹层全部用 `<Teleport to="body">` 包裹，真正脱离内容区，遮罩覆盖整个视口（含侧栏）。
- 处理 2（尺寸）：改为独立大窗口——宽 `min(1040px, 94vw)`、高 `min(88vh, 900px)`、居中、圆角 18px、阴影加强。
- 处理 3（布局）：面板 `display:flex; flex-direction:column; overflow:hidden`；头部 `flex:0 0 auto` 固定；`.panel-body` 为唯一滚动区。
- 校验：1500×820 视口下 `panel x=230 y=118 w=1040 h=585`（水平居中）；300px 矮视口下 `panel y=28 h=264、head y=33`，头部与「关闭」均可见。

- 修复生命牌第 1 步按钮文案：上一轮只替换到了 `aria-label`（字符串 replace 单次替换），按钮可见文字仍是「下一步」。现两处均为「回到一件真实的事」（`step === 0` 分支）。

## 2026-10-28 四时气韵 · 02 此刻 按设计稿重做

- 界面（按设计稿两张图）：`02 / 04 · 此刻` 眉题 → 两行大标题「最近，/ 发生了什么？」→ 引导段 → 三块无边框下划线式输入：
  1. 这件事是怎样发生的？（textarea，绑定 `experience`）
  2. 前面的底色，与你的经验有关吗？（2×2 选项：有共鸣 / 部分有关 / 与我的经验不同 / 暂时说不清，绑定 `season`）
  3. 哪些有关，哪些不同？（选填，textarea，绑定新增字段 `seasonNote`）
  → 脚注「可以暂时说不清，也可以留空继续。」→ 底部「回看底色」+「看看这件事的变化」。
- 数据：`answers` 与 `answerFields()` 增加可选字段 `seasonNote`；后端 `normalizeAnswers` 白名单同步加入（不列入必填）。注意 `restoreDraft`/`firstEmpty` 用的字段数组**未**改动，避免步骤索引错位。
- 校验：`next()` 补四时气韵第 2 步校验——经历描述为空提示「先写下这件事是怎样发生的」，未选关系提示「先选择你的经验与底色的关系」。
- 按钮：该步次要按钮显示「回看底色」，主按钮「看看这件事的变化」；`aria-label` 与可见文字同步。
- 样式：下划线式输入（`border-bottom` 1rpx、无底色）、2×2 选项网格（选中 2rpx 陶土下划线）、书写区最小高 236rpx。
- 校验：TS 语法通过、WXML 标签平衡（view 157/157、text 18/18）、WXSS 括号 150/150；390px 渲染与设计稿一致。

## 2026-10-28 四时气韵 · 此刻的变化（02 的子页）

- 交互：第 2 步（此刻）点「看看这件事的变化」进入子页（`seasonStage: 1`），步骤条仍停在 02；子页「回到这件事」回退到上一画面，主按钮「带着自己的理解继续」才推进到 03。
- 界面（按设计稿）：眉题 `02 / 04 · 此刻的变化` → 标题「这件事，/ 正在怎样变化？」→ 引导段 → 四季可展开列表（生 正在开始 / 长 继续培育 / 收 完成与取舍 / 藏 暂停与保存 / 暂时说不清）→ 「对这件事，你还看见了什么？（选填）」→ 脚注「这里辨认的是一件事中的变化，不是为你确定一个季节身份。」
- 交互细节：四季可多选，选中后展开内联输入框（「可以写下一点，也可以留空」）；「暂时说不清」与其余互斥。
- 数据：新增字段 `seasonStates`（逗号分隔）、`seasonStatesDetail`（JSON）、`seasonInsight`，后端 `normalizeAnswers` 白名单同步放开（均非必填）。`restoreDraft`/`firstEmpty` 的字段数组未改，避免步骤索引错位。
- 校验：子页未选任何状态时提示「先选择这件事正在发生的变化，或选择“暂时说不清”。」。
- 样式修复：「暂时说不清」原本套用单字大字号导致竖排换行，改为 `min-width` + `nowrap`，长文案用 `.is-note` 小字号横排。
- 校验：TS 语法通过、WXML 标签平衡（view 173/173、text 23/23）、WXSS 括号平衡；390px 渲染与两张设计稿一致。

## 2026-10-28 四时气韵 · 03 选择 按设计稿重做

- 界面：眉题 `03 / 04 · 选择` → 标题「哪些解释，/ 你愿意留下？」→ 引导段 → 「我想保留的」（textarea，必填）→ 「我不接受的，或另一种理解 · 选填」（textarea）→ 底部「回看变化」+「想想接下来的行动」。
- 数据：新增 `keepUnderstanding`（必填，客户端校验）、`rejectUnderstanding`（选填）；后端 `normalizeAnswers` 白名单同步放开。原 `season` 字段保留给 02 的「有关吗」使用，不再承担 03 的语义。
- 导航：`previous()` 在第 3 步回到「此刻的变化」子页（`step: 1, seasonStage: 1`），按钮文案「回看变化」；主按钮「想想接下来的行动」推进到 04。
- 校验：`next()` 第 3 步未填「我想保留的」时提示「先写下你想保留的部分，再继续。」。
- 文案修正：设计稿中「用自已的方式」应为「用自己的方式」，已按正确用词落地。
- 校验：TS 语法通过、WXML 标签平衡（view 178/178）、后端 `tsc` 通过；390px 渲染与设计稿一致。

## 2026-10-28 四时气韵 · 04 行动 按设计稿重做

- 界面：眉题 `04 / 04 · 行动` → 标题「接下来七天，/ 你愿意做什么？」→ 引导段 → 「我愿意做的一个最小行动」（textarea）→ 分隔线包裹的切换行「先留一点时间，不安排新行动」→「这次留下的」+ 预览值 → 脚注 → 底部「回看选择」+「保存这次观察」。
- 交互：切换「先留一点时间，不安排新行动」时，`sevenDayAction` 写入固定文案并清空输入；用户手动输入则自动取消勾选。勾选状态下 textarea 置灰不可编辑。
- 预览：`这次留下的` 显示当前 `sevenDayAction`，为空时显示「还没有写下具体的事」。
- 草稿恢复时按 `sevenDayAction` 的值还原勾选状态。
- 文案调整：设计稿脚注为「只保存在这台设备……」，但本产品实际是加密保存到云端（可跨设备、可在后台查看），故改为「保存的是你写下的经验与判断，不会生成性格结论；以后可以修改或删除。」如确需设备本地保存，需要另行改造。
- 校验：TS 语法通过、WXML 标签平衡（view 186/186）、WXSS 括号平衡；390px 渲染与两张设计稿一致。

- 修复「云端保存失败，请重试」：后端 `normalizeAnswers` 已放开新增的 6 个字段（seasonNote / seasonStates / seasonStatesDetail / seasonInsight / keepUnderstanding / rejectUnderstanding），但 api 进程仍是旧代码，草稿自动保存被 400 拒绝。重启 api 后恢复。
- 端到端验证：用测试令牌 POST `/api/observations`（season，含全部 9 个字段）→ 201 创建成功，字段完整回读，随后删除测试记录，库中无残留。
- 注意：改动 `backend/src` 后若日志出现 400 且提示「观察答案字段无效」，先 `docker compose restart api` 再排查。

- 修复「点击此刻观察白屏」：上一轮把 `restFirst: String(record.answers?…)` 误插到 `data` 初始对象（该处无 `record` 变量），页面加载时抛 ReferenceError 导致白屏。现 `data` 内为 `restFirst: false`，草稿恢复逻辑放回 `restoreDraft` 的 `setData`（`record` 有效作用域内）。
- 校验：`data` 块内已无任何外部变量引用；TS 编译通过。

## 2026-10-28 「云端保存失败，请重试」排查

- 日志证据：`2:32:50 POST /api/content/life-card/view 401`（当时登录态已失效）→ 观察草稿保存同样 401 → `syncState: 'error'` → 页面显示该提示。`2:34:32` 用户重新登录后 `POST /api/observations` 立即 201，说明**保存链路本身正常**，报错源于登录态失效，而非接口或字段问题。
- 附带发现：`utils/request.ts` 在 401 时只原样重试一次、不刷新令牌，故令牌过期后必然连续失败，只能重新登录。
- 改进：`saveCloudDraft` 捕获 401 时给出明确文案「登录状态已失效，请回到「我的」重新进入后再保存。」，不再与网络/服务故障混为一谈（`ApiRequestError.statusCode`）。
- 说明：`syncState: 'error'` 为粘性状态，重新登录后需重新进入页面才会恢复；如需登录后自动重试，可作为后续优化。

- 「云端保存失败」持续排查：服务端 `--since 15m` 无任何 `POST /api/observations` 记录，仅健康检查；`netstat` 显示 61021 在监听且有本机连接。判断请求在到达服务端前即失败，重点怀疑 `request()` 内的 `app.ensureLogin()`（会先清空本地登录态再 `wx.login`）或开发者工具网络限制。
- 验证 `/auth/wechat/login` 用假 code 返回 401（微信侧正常拒绝），说明登录接口本身可用。
- 改进：同步失败提示由固定文案改为显示真实错误 `{{error || '云端保存失败，请重试'}}`，便于定位是登录、超时还是网络问题。

- 深化排查：开发者工具 Network 面板显示只有 `app.wxss`/`SdkReport` 请求，**没有任何 `/api/` 调用**，确认保存请求未发出（与 `wx.login` 阶段失败现象一致，服务端因此无日志）。
- 修复「错误信息不显示真实原因」：`wx.login` 失败时错误对象只有 `errMsg` 而无 `message`，原先取 `caught.message` 得到空串 → 回落到固定文案。现两处（自动保存 L429、显式保存 L562）改用 `apiErrorMessage(caught, …)`，它会读取 `errMsg` 并附加到提示后。
- WXSS 检查：`app.wxss` / `observation` / `season-intro` 括号均配平、无 U+FFFD 与控制字符；工具内 `app.wxss` 500 属开发者工具本地文件服务的偶发问题，可通过重启工具解决。

## 2026-10-28 定位并修复「云端草稿未能确认，请重试。」

- 真实报错：页面显示 `暂时无法同步云端，请检查网络后重试。（云端草稿未能确认，请重试。）`，来自 `pages/observation/index.ts` 中 `persistObservation` 对返回值的校验。
- 根因：`utils/observation.ts` 的 `isAnswerMap` 白名单写死旧字段 `['birthDate','experience','season','sevenDayAction']`，新增的 `seasonNote`/`seasonStates`/`seasonStatesDetail`/`seasonInsight`/`keepUnderstanding`/`rejectUnderstanding` 不在其中 → `isCloudObservation` 判假 → 尽管后端已 201 保存成功，前端仍抛错并显示保存失败。
- 同类问题一并修复：`utils/privacy.ts` 的 `isExportAnswerMap` 有同一份旧白名单，会导致隐私导出解析失败。
- 未改动：`pages/observation/index.ts` 两处 `fields` 数组（用于 `firstEmpty` 步骤定位）保持旧字段，避免草稿恢复跳到错误步骤。
- 端到端校验：以 season 方法提交含全部 9 个字段的草稿 → 201 成功，返回字段全部落在白名单内、无超长，满足 `isCloudObservation` 全部条件；测试记录已删除。

- 四时气韵 02 此刻（stage 0）三项修正：
  1. 输入区改为**可见文字框**：新增 `.season-input-box`（1rpx 边框 + 圆角 + 半透明底 + 内边距），全部步骤的 `season-input` 统一替换为带框样式（共 4 处）。
  2. 四个选项此前**点了无反应**：它们绑定的 `selectOption` 内含 `selected !== 'reality'` 直接 return，四季选项从未生效。新增专用处理 `selectSeasonLink`（单选，再次点击可取消），并绑定 `bindtap="selectSeasonLink"`。
  3. 选中后在问句右侧显示所选值：`.season-label-row` + `.season-label-value`（陶土色、下划线），并新增「也可以用自己的话写」紧凑输入框，与选项共用 `answers.season`，实现「可选可自定义」。
- 校验：TS 编译通过、WXML view 标签平衡（186/186）、WXSS 括号平衡；390px 渲染确认三个文字框与选中态显示正常。

- 四时气韵 02 此刻（stage 0）样式回调（按最新要求）：
  1. 选中值移到问句同一行的**右端**（`.season-label-row { justify-content: space-between }`），陶土色 + 下划线。
  2. 移除四个选项下方的「也可以用自己的话写」输入框，仅保留四个下划线选项。
  3. 输入区恢复原有的**下划线样式**（`border: 0` + `border-bottom: 1rpx`，背景透明），撤销上一轮的整框边框与底色。
- 校验：TS 编译通过、WXML view 标签平衡（186/186）、WXSS 括号平衡（177/177）；390px 渲染确认三项均符合预期。

- 移除「前面的底色，与你的经验有关吗？」行右侧选中值的下划线（`.season-label-value` 去掉 `border-bottom` 与 `padding-bottom`），保留陶土色加粗文字；四个选项自身的下划线不受影响。

- 彻底移除「前面的底色，与你的经验有关吗？」行右侧的选中值显示（`season-label-value` 元素及其 `season-label-row` 包裹层），问句恢复为普通 `.season-label`；同时清理对应 WXSS 规则。选中状态仅由四个选项自身的陶土色 + 2rpx 下划线表达。

- 底部草稿提示文案替换：`输入停顿后会自动保存草稿，离开页面时也会尝试同步。云端版本变化时，请选择载入云端或确认使用本机回答覆盖。` → `可以暂时说不清，也可以留空继续。`（仅替换四时气韵分支，从现实处境分支保持不变）。
- 同时删除第 2 步卡片内原有的同名 `season-footnote`，避免同一屏出现两次；`season-footnote` 样式仍被「此刻的变化」「行动」两步使用，予以保留。
- 校验：文案全页仅剩 1 处；WXML view 标签平衡（185/185）。

- 四时气韵「前面的底色，与你的经验有关吗？」改为**可选**（不选也能继续）：
  1. 前端：移除 `next()` 中对 `answers.season` 的拦截（原提示「先选择你的经验与底色的关系，再继续。」）。
  2. 后端：`assertCompleteAnswers` 的 season 必填列表由 `['birthDate','experience','season','sevenDayAction']` 调整为 `['birthDate','experience','sevenDayAction']`，否则能进下一步但最终保存必失败。
- 端到端验证：草稿创建 201 → 最终保存 200（`status=saved`，answers 仅含 `experience`/`sevenDayAction`，`birthDate` 按 `SEASON_SAVE_BIRTH_DATE=false` 丢弃）→ 清理 200。
- 注意：`POST /api/observations` 的 `status` 仅接受 `draft`，最终保存需走 `PATCH /api/observations/:id`（排查时曾因误用 POST+saved 得到 400）。

- 继续放开四时气韵必填：「这件事是怎样发生的」（`experience`）也不再拦截。
  - 前端：移除 `next()` 中 stage 0 的 experience 校验（原提示「先写下这件事是怎样发生的，再继续。」），可空着直接进入「此刻的变化」。
  - 后端：season 必填列表精简为 `['birthDate', 'sevenDayAction']`，即仅「七天行动」必填。
- 端到端验证：仅提交 `birthDate` 建草稿 → 201；最终保存仅含 `sevenDayAction` → 200（`status=saved`，answers 只有 `sevenDayAction`）；测试记录已清理。
- 现四时气韵可选字段：experience、season、seasonNote、seasonStates、seasonStatesDetail、seasonInsight、keepUnderstanding、rejectUnderstanding；必填：sevenDayAction（birthDate 仅用于日期校验、不落库）。

- 「此刻的变化」四季列表两项调整：
  1. 「暂时说不清」改为与其余四项**完全平等的独立多选**（移除原先的互斥逻辑 `next = ['暂时说不清']`），五项可任意组合、可同时选中。
  2. 收紧行上下间距：`.season-state-head` 最小高 132rpx → 116rpx、内边距 30/26rpx → 26/22rpx，标签与提示间距 10rpx → 8rpx。
- 校验：TS 编译通过、WXSS 括号平衡（175/175）；390px 渲染确认五项均可选中（`−`）且间距更紧凑。

## 2026-10-28 修复「四季状态无法选择」

- 根因：WXML 中使用了 `{{seasonStates.indexOf(item.key) > -1}}` 判断选中态，但 **WXML 表达式不支持方法调用**，该表达式恒为假 → 选中类名、`−/+` 标记、`aria-expanded`、展开输入框全部失效，点击后界面毫无反馈，看起来就是「选不了」。
- 修复：新增预计算视图模型 `seasonStateView`（每项含 `selected` 与 `detail`），由 `rebuildSeasonStateView(states, details)` 生成；WXML 改为 `wx:for="{{seasonStateView}}"` 并只做属性读取（`item.selected` / `item.detail`）。
- 同步点：`onLoad` 初始化空视图、进入 stage 1 时按当前数据重建、`toggleSeasonState` 与 `handleSeasonStateInput` 后重建、草稿恢复时解析 `seasonStates`（逗号分隔）与 `seasonStatesDetail`（JSON）。
- 逻辑验证：初始 5 行；点「生」选中；再点「暂时说不清」两者共存（已非互斥）；再点「生」取消；五项可同时全选。
- 校验：TS 编译通过、WXML 标签平衡（view 185/185、text 30/30）、WXSS 括号平衡（175/175）。

- 「此刻的变化」四季列表改为**纯选择**（非展开折叠）：
  1. 右侧标记：未选 `+`、已选改为 **`✓`**（原为 `−`，易被理解为折叠）。
  2. 移除每项选中后展开的内联输入框（`season-state-input`）及对应 WXSS，不再有折叠行为。
  3. 选中后视觉加深：季字与标题 `#5c2417` + `font-weight: 700`，提示文字 `#7a4a37`，勾选标记同色加粗。
  4. 语义角色由 `role="button"` + `aria-expanded` 改为 `role="checkbox"` + `aria-checked`，与「选择」语义一致。
- 校验：WXML 标签平衡（view 185/185）、WXSS 括号平衡（175/175）；390px 渲染确认选中项为深色 + 勾，未选中为浅色 + 加号。

- 「暂时说不清」两项调整：
  1. 恢复互斥：选中「暂时说不清」会清空四季（生/长/收/藏）；选中任一季会取消「暂时说不清」。实测序列：`[生]` → `[生,收]` → `[暂时说不清]` → `[长]` → `[长,生]`。
  2. 布局独立化：新增 `.season-state--note`，该行 `min-height: 92rpx`、`align-items: center`、季字改为 26rpx 常规字号（不再套用四季单字 44rpx），并隐藏空的 `.season-state-main`；勾选标记用 `margin-left: auto` 推到最右，与其余四项右对齐一致。
  3. 视图模型新增 `isNote` 标记（由 `!option.hint` 推导），WXML 据此挂载 note 类；移除不再使用的 `.season-state-key.is-note` 规则。
- 校验：WXML 标签平衡（view 185/185、text 30/30）、WXSS 括号平衡（177/177）；390px 渲染确认「暂时说不清」为单行文字 + 右侧标记，选中态文字加深。

- 「对这件事，你还看见了什么？」标签改为更轻的样式（对齐设计图第二张）：新增 `.season-label--soft`——字号 25rpx → 22rpx、字重 600 → 400、颜色 `#4a3f38` → `#8b6b58`；其后「选填」同步改为 `#8b6b58` / 20rpx，不再强调为陶土色。
- 仅作用于该标签，其余步骤的 `.season-label` 保持原样。

- 「03 选择」引导段断行优化：原文自动换行会把「理解」拆成「理 / 解」两行。改为按逗号处语义断行（两个 `.season-lead-line` 块级行）：
  - 第一行「可以保留一个问题，拒绝一种解释，」
  - 第二行「也可以用自己的方式重新理解这件事。」
- 新增 `.season-lead-line { display: block; }`，仅用于该引导段。

- 四季列表按设计图调整视觉节奏：
  1. 行距恢复舒展：`.season-state-head` 最小高 116rpx → 132rpx、内边距 26/22rpx → 30/28rpx，标签与提示间距 8rpx → 10rpx。
  2. 分割线两侧内缩：改用伪元素 `.season-state::after`（`left/right: 6rpx`）+ 列表顶部 `.season-state-list::before`，不再使用整行 `border-bottom`。
  3. 「暂时说不清」行独立保持紧凑（96rpx / 24rpx 内边距）。
- 校验：WXSS 括号平衡；390px 渲染确认四行分隔线内缩、行距更舒展。

- 四季列表按目标图整体放大（此前偏紧、字号偏小）：
  | 项 | 原值 | 现值 |
  | --- | --- | --- |
  | 行最小高 | 132rpx | 176rpx |
  | 上下内边距 | 30/28rpx | 36/34rpx |
  | 季字字号 | 44rpx | 52rpx |
  | 标题字号 | 26rpx | 28rpx |
  | 提示字号 | 22rpx | 23rpx |
  | 提示上间距 | 10rpx | 14rpx |
  | `+` 字号 | 34rpx | 36rpx |
  | 「暂时说不清」行 | 96rpx | 120rpx（季字 28rpx） |
- 校验：WXSS 括号平衡；368px 渲染确认行高、字号、分隔线与目标图一致。

## 2026-10-28 四季列表样式失灵的根因：CSS 重复定义

- 现象：按要求改了字号与颜色，界面上不生效。
- 根因：历次「微调」在 `index.wxss` 末尾反复追加同名规则，导致 `.season-state-key` 被定义 **5 次**、`.season-state-head` 多次；同优先级下最终由书写顺序裁决，把字号/颜色改回了旧值。另有一处脚本误替换，产生 `.season-state-key, .season-state.open .season-state-label { color:#5c2417; font-weight:700 }` 这种**未选中与选中合并**的错误选择器，使全部季字都变成深色。
- 处理：删除 31 个旧的四季相关规则块，重写为**唯一定义段**并加注释标注「请勿在别处重复」；选中态改用 `.season-state.open .xxx` 独立声明，未选中态回到 `#3f352e`。
- 现参数：行高 176rpx、季字 52rpx、标题 28rpx、提示 23rpx、`+` 36rpx；选中态 `#5c2417` + 700；「暂时说不清」120rpx、28rpx、垂直居中。
- 校验：每个 `.season-state*` 选择器仅一条规则、无合并错误；WXSS 大括号 183/183；368px 渲染确认未选中为深灰褐、选中为深陶土加粗。

- 「对这件事，你还看见了什么？ 选填」标签下方增加下划线：`.season-label--soft` 加 `padding-bottom: 14rpx` + `border-bottom: 1rpx solid #cdbbae`，与下方输入框的下划线形成上下呼应。

- 脚注字号放大：`.season-footnote` 由 21rpx 调整为 23rpx，`line-height` 保持 1.8。作用于「此刻的变化」脚注（这里辨认的是一件事中的变化…）与「行动」脚注（保存的是你写下的经验与判断…）。

- 「03 选择」页两个标签下方增加下划线：新增 `.season-label--line`（`padding-bottom: 14rpx` + `border-bottom: 1rpx solid #cdbbae`），应用于「我想保留的」与「我不接受的，或另一种理解 · 选填」。
- 校验：WXML view 标签平衡（185/185）、WXSS 括号平衡（183/183）；368px 渲染确认两处标签下划线正常，与输入框下划线形成上下呼应。

- 「03 选择」两个标签（我想保留的 / 我不接受的，或另一种理解 · 选填）颜色改为 `#b1a59a`；其后「选填」字号 21rpx → 24rpx，并 `vertical-align: baseline` + `line-height: inherit` 与左侧标签文字基线对齐，颜色同步为 `#b1a59a`。
- 校验：WXSS 括号平衡（185/185）；368px 渲染确认两标签为浅灰褐、选填字号更大且与左侧对齐。

## 2026-10-28 「提取的颜色与实际差距大」的原因分析

- 用 PIL 对两张图做像素统计（背景取众数，文字核心取最暗 2% 像素均值）：
  | 图 | 背景 | 文字核心色 |
  | --- | --- | --- |
  | demo（设计稿） | `#E7DFD1` | **`#916162`** |
  | 实际渲染 | `#E7DFD1` | `#B3A79C` |
- 结论：用户提取到的 `#B1A59A` 实际接近「实际渲染图」的抗锯齿混合色，而非 demo 的真实文字色。小号衬线字在浅底上笔画偏细，吸管容易取到「文字与背景的混合像素」；demo 字号更大，才露出笔画中心色。两者并非同一颜色（R/G/B 分别差 32/68/56，差异主要在 G、B 通道，即饱和度）。
- 处理：将 `.season-label--line` 与其中 `.season-optional` 的颜色由 `#b1a59a` 改为 demo 实测的 `#916162`。
- 复核：改后渲染再取样，文字核心色为 `#9A6D6E`，与 demo 的 `#916162` 基本一致（差值来自抗锯齿）。
- 方法沉淀：需要从设计图取色时，应取**笔画中心**而非边缘；或直接对图片做「最暗像素均值」统计，避免抗锯齿干扰。

- 按钮文字加粗：`.button` 增加 `font-weight: 600`（原先未设，使用默认常规），影响「回看变化」「想想接下来的行动」等操作按钮。
- 顺带治理重复定义：`observation/index.wxss` 中 `.button` 曾被定义 8 次（多轮追加所致），已合并为唯一一份（含 `secondary` / `destructive` / `[aria-disabled]` / `::after`），删除 10 条冗余规则；其余关键规则（四季列表、标签下划线、输入框、脚注、开关）经检查均完整保留。
- 校验：WXSS 括号 180/180 平衡；渲染确认两个按钮样式与加粗效果正常。

- 「03 选择」取消必填拦截：移除 `next()` 中对 `keepUnderstanding` 的校验（原提示「先写下你想保留的部分，再继续。」），不填写也可进入「04 行动」。后端必填此前已是 `['birthDate', 'sevenDayAction']`，无需改动。
- 现四时气韵仅剩一处客户端拦截：「02 此刻的变化」需至少选一个四季状态或「暂时说不清」（提示「先选择这件事正在发生的变化，或选择“暂时说不清”。」）。

- 「04 行动」引导段按「等待」处断行（原自动换行会把「也可以」与「是」拆开）：改为两个 `.season-lead-line` 块级行——
  - 第一行「选一个小到能够发生的行动。休息、等待、」
  - 第二行「继续观察，也可以是此刻的选择。」
- 校验：WXML view 185/185、text 34/34 平衡；368px 渲染确认断行位置正确。

- 「04 行动」中「我愿意做的一个最小行动」标签颜色改为 `#916162`：新增 `.season-label--tint` 修饰类，仅着色、不加下划线（与 03 的 `--line` 区分）。
- 校验：WXML view 185/185 平衡、WXSS 括号 181/181；渲染实测文字核心色 `#A68982`（`#916162` 加粗小字经抗锯齿后的视觉值，与 03 标签行为一致）。

- 「我愿意做的一个最小行动」标签下方增加下划线：`.season-label--tint` 补充 `padding-bottom: 14rpx` + `border-bottom: 1rpx solid #cdbbae`（保留 `color: #916162`），与下方输入框下划线呼应。
- 校验：WXSS 括号 181/181、`--tint` 仅一处定义；渲染确认标签下划线正常。

## 2026-10-28 修复「此刻观察」页面白屏

- 排查过程：TS 编译、WXML 标签（view 185/185、text 34/34）、WXSS 括号与规则结构（181 条、无孤立选择器）均正常，基础布局类（`.observation-page` / `.step` / `.actions` 等）齐全，说明不是语法或样式缺失导致的空白。
- 定位：`onLoad` 中新增的 `seasonStateView: this.rebuildSeasonStateView([], {})` —— 该方法内部读取 `this.data.seasonStateOptions`，在页面生命周期最早期执行存在初始化顺序风险，异常会使整页渲染中断。
- 修复：移除 `onLoad` 中的该调用；`seasonStateView` 改为在 `data` 内**静态初始化**为五项完整对象（selected/detail/isNote 均为初始值），不再依赖运行时方法调用。运行期仍由 `rebuildSeasonStateView` 在勾选、填写、进入该步、草稿恢复时重建。
- 校验：TS 编译通过、WXML/WXSS 结构正常。

## 2026-10-28 白屏真正原因：WXSS 编译错误（残缺选择器）

- 报错：`./pages/observation/index.wxss(104:1): unexpected token @keyframes`。WXSS 编译失败导致整页白屏，与 JS 无关——此前排查方向（onLoad 初始化、缓存）均未命中。
- 根因：早前用脚本批量删除重复规则块时，删除了规则体却留下**孤立的残缺选择器**行：
  - L90 `.issue-load-error`（前面已有完整定义）
  - L92 `.page >`（被截断）
  - L101/L102 `.guide-actions`（重复且无规则体）
  这些残缺行紧邻 `@keyframes guide-fade`，使解析器把 `@keyframes` 当作规则体内容而报错。
- 修复：删除上述 4 行残缺内容；现文件 181 条规则、大括号 181/181 且逐字符配对正常（无提前闭合）、`@` 规则位置合理。
- 校验方法沉淀：批量改 WXSS 后应做「逐字符括号配对」与「孤立选择器扫描」，仅比较 `{`/`}` 数量不足以发现此类问题（数量相等但顺序错乱时仍会报错）。

- 「先留一点时间，不安排新行动」文字颜色由 `#3f352e` 改为 `#916162`（与 03/04 页标签配色统一）；选中态仍为更深的 `#663124`，配 `✓` 标记。
- 括号 181/181 平衡；渲染确认两种状态差异清晰。

- 「先留一点时间，不安排新行动」点击后自动填充内容由 `先留一点时间，不安排新行动` 改为 `这七天先不安排新的行动，给自己休息与观察的时间。`（同时影响「这次留下的」预览）。
- 草稿恢复的判定放宽为正则 `/^(这七天先不安排新的行动|先留一点时间)/`，兼容历史草稿中保存的旧文案，避免恢复后勾选状态丢失。
- 校验：TS 编译通过。

- 去掉「这次留下的」预览与输入框的重复显示：预览块改为**仅空态显示**（`wx:if="{{!answers.sevenDayAction}}"`），内容固定为「还没有写下具体的事」；一旦输入框有内容（含点击「先留一点时间」自动填充）该块即隐藏。
- 校验：WXML view 185/185 平衡；渲染确认已填写时无重复、空态仍保留提示。

## 2026-10-28 观察记录详情页改造（方案 A：保存生日）

### 后端
- `SEASON_SAVE_BIRTH_DATE` 由 `false` 改为 `true`（`.env.local`、`.env.production`、`.env.production.example` 同步）。三处按该开关剔除 `birthDate` 的逻辑（admin / user / observation 控制器）会自动改为保留。
- 注意：**`docker compose restart` 不会重新读取 `env_file`**，必须 `up -d` 重建容器；且重建后 `dist` 未重编译时需再 `restart api` 一次，否则跑的是旧代码（本次即因此一度验证失败）。
- `GET /api/observations/:id` 新增 `lifeCard` 字段：按记录中的 `birthDate`（`YYYY-MM-DD`）反查 `content_life_cards`，返回 `month/day/suit/rank/theme/title/summary/note`；无生日或无匹配牌时该字段不出现。
- 实测：保存含 `birthDate=2000-01-12` 的记录 → 详情返回 `{"month":1,"day":12,"suit":"spade","rank":"2","title":"在靠近中，听见自己",...}`。

### 前端（`pages/observation-detail`）
- 详情页按设计稿重做为四段式结构：
  - meta：`四时气韵` / `10月28日 · 此设备保存`
  - `01 · 底色 · 2♠` + 生命牌标题（46rpx 大字）+「本次借用的品牌观察线索」
  - `02 · 此刻`：「我写下的经验」「我辨认的变化」（四季状态转中文：生→正在开始、长→继续培育、收→完成与取舍、藏→暂停与保存），空值显示灰色「未填写」
  - `03 · 选择`：「我想保留的」、有内容时才显示「我不接受的，或另一种理解」
  - `04 · 行动 · 接下来七天` + 行动内容（34rpx 大字）
  - 判断区：`你对/此线索/的判断` + 「暂未作判断」+「这份判断可以随时修改；你的经验始终拥有解释权。」
- 底部按钮：`修改这次观察`（主）+ `再次观察`、`删除记录`（次要，左右并排）。
- `startAgain()`：优先用记录里的生命牌直接进入四时气韵（`?method=season&birthMonth&birthDay`），无牌时回退生日解析，现实处境流程则从现实入口重新开始。
- 现实处境记录复用同一版面（底色=处境、此刻=身体感受、选择=需要、行动=下一步）。
- 校验：TS 编译通过、WXML（view 47/47、text 5/5）、WXSS（41/41）平衡；390px 渲染与设计稿一致。

- 四季列表配色统一：未选中态由灰色改为与选中态相同的深陶土——`.season-state-key` / `.season-state-label` 的 `#3f352e` → `#5c2417`，`.season-state-hint` 的 `#5c493c` → `#7a4a37`。选中与否仅由 `✓`/`+` 标记与字重（700 vs 600）区分，解决「收/藏 字体太灰」的问题。
- 括号 181/181 平衡；渲染确认四项色相一致。

## 2026-10-28 修正：完成后展示的页面错误

- 问题：用户反馈「完成后这个页面还是没变」。原因是我把「观察已保存」的完成提示页（`pages/observation` 的 `phase: 'done'`）与「观察记录详情页」（`pages/observation-detail`）当成同一个页面，只改了后者。
- 修复：在 `next()` 保存为最终记录成功后，直接 `wx.redirectTo({ url: '/pages/observation-detail/index?id=…' })`，用 `redirectTo` 替换当前页（返回键直接回到上层，不会退回空白编辑页）；跳转失败时保留原完成提示页兜底。
- 端到端验证：以 2000-10-28 生日提交含全部 9 个字段的记录 → 详情返回 `lifeCard: 6♦ / 在靠近中，听见自己`，字段完整；渲染确认四段版面与设计稿一致，测试数据已清理。

## 2026-10-28 观察记录页改用自定义导航栏 + 移除原生 button

### 灰底圆形房子按钮的来源
- 用户截图中的按钮是**微信原生导航栏的「返回首页」按钮**（无法返回上一级时自动出现），属于客户端控件，代码无法改其颜色与样式。
- 根因：`pages/observation-detail` 是少数仍使用系统导航栏的页面（`index.json` 只有 `navigationBarTitleText`）。
- 修复：改为 `navigationStyle: custom`，新增自绘顶栏（细线 `‹` + 居中标题「观察记录」），与 `observation` / `season-intro` 等页面一致；`onLoad` 读取 `statusBarHeight`，新增 `handleBack()`（有上级则返回，否则回「我的」）。

### 移除原生 <button>
- 将 5 个页面共 **15 处**普通点击按钮由 `<button>` 改为 `<view role="button" tabindex="0">`：about(2)、mine(1)、privacy(6)、privacy-policy(3)、profile(3)。
- 保留 3 处**必须**使用原生按钮的场景（微信要求 `open-type` 才能唤起系统能力）：`login` 的 `getPhoneNumber`、`mine` 与 `profile` 的 `chooseAvatar`。
- 同步修正标签名选择器（改为纯类选择器，否则改成 view 后样式失效）：`app.wxss` 的 `button.button` → `.button`（3 处）、`home/index.wxss` 的 `button.text-button` / `button.contents-row` → 类选择器。
- 校验：6 个改动页 WXML 标签平衡（16/16、81/81、44/44、15/15、23/23、52/52）、WXSS 括号平衡；全项目已无 `button` 标签名选择器。

- 「你对此线索引的判断」区块布局统一：由「左侧窄栏 + 右侧值」的两栏结构（且标签被硬折成三行）改为与 02/03/04 段一致的「标签在上、值在下、说明再下」结构；`perspective-note` 同步左缩进 56rpx 与 `stage-value` 对齐。
- 清理 `.perspective-row` / `.perspective-key` 旧规则；WXML view 53/53、text 3/3 平衡，WXSS 括号 46/46。

- 「观察记录」整页布局统一：正文全部**左对齐**，去掉 56rpx 缩进（`stage-value`、`stage-action`、`perspective-note`），标题与内容同一左边缘。
- 收紧留白（去掉多余空行感）：`stage` 内边距 40/34 → 34/28rpx、`stage-block` 上间距 34 → 28rpx、首个 block 40 → 26rpx、`stage-value` 上间距 18 → 12rpx、`stage-action` 上间距 40 → 20rpx、`perspective-note` 20 → 14rpx；`perspective` 顶部 8rpx 归零。
- 行动内容字号 34 → 32rpx，避免与标题抢层级；`stage-value` 行高 1.85 → 1.8。
- 校验：WXSS 括号 46/46；渲染确认全页左边缘对齐、无多余空行。

- 观察记录页三个按钮样式统一：`again-button` / `delete-button` 由「透明底 + 边框」改为与 `edit-button` 一致的深色填充（`background: #73362a`、`color: #fffaf4`、`border: 0`、`min-height: 92rpx`、`font-size: 27rpx`、`letter-spacing: 1rpx`）；移除两者各自的红褐色文字与边框着色规则。
- 布局保持：主按钮整行、两个次要按钮左右并排。
- 校验：WXSS 括号 44/44；渲染确认三按钮视觉一致。

- 正文字号对齐 01 段：`stage-value`（各段的值）28rpx → **24rpx**，`stage-action`（04 行动内容）32rpx → **24rpx**，与 01 段正文 `stage-subtitle`（本次借用的品牌观察线索）一致；`stage-action` 上间距 20 → 16rpx。
- 现全页字号层级：标签 21rpx / 正文 24rpx / 01 标题 46rpx / 按钮 27rpx。
- 校验：WXSS 括号 44/44；渲染确认三段正文字号统一。

- 01 段正文（生命牌标题「在靠近中，听见自己」）字号由 46rpx 调整为 **24rpx**，与其余各段正文一致；`margin-top` 40 → 12rpx、`line-height` 1.45 → 1.8、`letter-spacing` 1rpx → 0，`stage-subtitle` 上间距 30 → 18rpx。
- 现全页字号：段落标签 21rpx / 全部正文 24rpx / 按钮 27rpx，仅靠颜色与字重区分层级。
- 校验：WXSS 括号 44/44；渲染确认 01 正文与其它段完全同号。

## 2026-10-28 修复后台「观察内容格式无效」

- 现象：后台「观察记录管理」点「查看内容」，弹层报「观察内容格式无效」。
- 根因：`management/src/api-shapes.ts` 的 `isManagedObservationDetail` 仍使用旧白名单 `['experience','season','sevenDayAction','birthDate']`，缺少四时气韵新增的 6 个字段，导致校验失败——与小程序此前「云端草稿未能确认」是同一类问题（前端校验白名单没跟上字段新增）。
- 处理：白名单补齐为 10 个字段，与后端 `normalizeAnswers`、小程序 `isAnswerMap` / `isExportAnswerMap` 完全一致。
- 端到端验证：提交含全部 10 字段的记录 → 后台 `GET /admin/observations/:id` 返回 200，answers 字段齐全、无越界字段、无类型或超长异常；测试数据已清理。
- 教训：每次给观察 answers 新增字段，需同步 4 处白名单——后端 `normalizeAnswers`、小程序 `utils/observation.ts`、小程序 `utils/privacy.ts`、后台 `management/src/api-shapes.ts`。

### 后台「观察内容格式无效」的后续修复
- 白名单补齐后仍然报错：真实原因是 **Vite 未热更新** `api-shapes.ts`，后台页面仍在跑旧校验。`docker compose restart admin` 后错误消失——本项目 Vite 对挂载卷的文件监听长期不可靠，改后台源码后必须重启容器。
- 后台字段标签补齐（`observationAnswerLabels`）：新增 `seasonNote` / `seasonStates` / `seasonStatesDetail` / `seasonInsight` / `keepUnderstanding` / `rejectUnderstanding`，并把标签改为「步骤 · 字段」形式（如「底色 · 生日」「此刻 · 与底色的关系」「选择 · 我想保留的」「行动 · 接下来七天」）。
- 弹层可读性优化：
  1. 按 `observationAnswerOrder` 固定展示顺序（底色→此刻→选择→行动），不再依赖对象键顺序；
  2. 过滤空值字段，不再出现空白框；
  3. `seasonStates` 原始键映射为中文（`收,长` → 「完成与取舍、继续培育」）；
  4. 隐藏 `seasonStatesDetail`（JSON 中间态，UI 已不再采集每季说明）。
- 校验：后台 `vue-tsc + vite build` 通过；截图确认弹层仅显示有内容的字段、全部中文、无报错。

- 后台观察详情改为**显示全部字段**（此前过滤了空值）：空字段统一显示浅灰「未填写」占位，并用 `.observation-answer--empty` 弱化文字颜色，便于一眼看出用户哪些没填；仍隐藏 `seasonStatesDetail`（JSON 中间态）。
- 校验：后台 `vue-tsc + vite build` 通过；截图确认空字段正常显示「未填写」、有值字段正常。

- 后台观察记录「用户」显示由 **UUID 截断**改为**昵称**：
  1. 后端 `admin-observation.controller.ts` 的列表与详情查询 `left join users u on u.id = o.user_id`，返回 `nickname`（列表分页计数查询同步 join）。
  2. 后台 `api-shapes.ts` 的 `ManagedObservation` 补 `nickname?: string | null`。
  3. 后台弹层与列表均改为「优先昵称，无昵称时回退 userId 前 8 位」。
- 顺带修掉列表里 `2222…` 的假省略号：模板表达式后残留了一个字面量 `…`（原为 UUID 截断准备），已删除，现在昵称完整显示。
- 校验：后端 `tsc` 通过并实测 `GET /admin/observations` 与 `/:id` 均返回 `nickname: "2222"`；后台构建通过，截图确认列表与弹层均显示昵称。

- 后台「观察记录管理」表格：原「用户 / 更新时间」合并列拆分为**两列**——「用户」（昵称，回退 userId 前 8 位）与「更新时间」（时间戳），均用等宽字体。
- 列宽调整为 6 列：`1.1fr .9fr .6fr .8fr 1.2fr auto`（方式 / 期刊 / 状态 / 用户 / 更新时间 / 内容）。
- 校验：后台构建通过；截图确认两列独立显示、对齐正常。

## 2026-10-28 观察记录管理：按钮改名移位 + 表格列对齐

1. **按钮改名**：「扫描并保护历史答案」→「同步历史」（同步中显示「同步中…」，续传显示「继续同步」）。
2. **按钮移位**：从标题区 `.section-tools` 移入筛选行末尾，靠右对齐；筛选行改为 `align-items: flex-end`、各 `label` 为 grid（标签在上、控件在下），「只看超期草稿」用 flex 居中并与下拉框等高（40px），按钮 `margin-left: auto`。
3. **表格列不对齐的根因**：表头与数据行是**两个独立 grid**，最后一列用 `auto` 时各自按内容计算——表头「内容」两字撑出 23.8px，数据行按钮撑出 88px，导致所有 `fr` 列被挤得错位。
   - 修复：最后一列改为固定 `104px`。
   - 实测验证（getBoundingClientRect）：修复前 head 列起点 `320, 578, 792, 940, 1132, 1412` vs row `320, 563, 764, 904, 1085, 1348`；修复后两者**完全一致** `320, 559, 757, 895, 1073, 1332`，grid 轨道亦相同 `222.86/192.34/121.58/162.08/243.14/104px`。
- 校验：后台构建通过；截图确认筛选行对齐、表格列对齐。

## 2026-10-28 删除「共同实践」页的「示例预览」标识

- 来源：该文案不是硬编码在小程序里，而是后台可编辑的富文本字段 `sharedPracticeCopy.onlinePreview`，默认值 `{ richText: '示例预览', fontSize: 10, color: '#8b6b58' }`。
- 确认历史数据：`content_practice_entries` 中无 `onlinePreview` 条目，线上显示的就是后端默认值，因此可安全彻底删除，不会造成旧数据校验失败。
- 共清理 5 处：
  1. 小程序 `pages/shared-practice/index.wxml`：删除 `<rich-text class="shared-section-preview">` 渲染行；
  2. 小程序 `utils/content.ts`：`sharedPracticeCopy` 校验白名单移除 `onlinePreview`；
  3. 后端 `content.controller.ts`：移除默认值与该字段的 DTO 声明；
  4. 后台 `App.vue`：`SharedPracticeCopyKey` 类型联合与「预览标识」表单项移除。
- 验证：小程序 TS 编译通过、WXML view 32/32 平衡；后端 `tsc` 通过；后台构建通过；实测 `GET /api/content/practice` 返回的 `sharedPracticeCopy` 已无 `onlinePreview`、响应中不含「示例预览」。

## 2026-10-28 「本期讨论」页按设计稿调整排版

- 结构无需改动：现有 WXML 已与设计稿一一对应（眉题 / 期刊行 / 标题 / 引导 / 三段说明 / 写下我的经历 / 从不同的日常里 / 示例条目 / 编辑追问 / 展开对话 / 私密收尾），本次仅调样式。
- 字号与字重调整：
  | 元素 | 原值 | 现值 |
  | --- | --- | --- |
  | 眉题 `.discussion-meta` | 24rpx、gap 48 | 20rpx、gap 36、加字距 |
  | 期刊行 `.discussion-issue-line` | 24rpx | 20rpx |
  | 标题 `.discussion-title` | 52rpx/700 | 46rpx/600 |
  | 引导 `.discussion-lead` | 31rpx | 27rpx |
  | 三段说明 `.discussion-description` | 27rpx/**600** | 24rpx/**400** |
  | 示例正文 `.discussion-thread-body` | 29rpx/600 | 26rpx/500 |
  | 作者行 `.discussion-thread-meta` | 26rpx | 25rpx |
  | 写下我的经历 | 88rpx、上下边框 | 76rpx、**仅下边框** |
- 「编辑追问 / 回应」改为**左侧竖线引用块**：`.discussion-reply` 加 `border-left: 2rpx`、左内边距 28rpx、缩进 8rpx；作者行 21rpx 浅褐、正文 24rpx 常规字重；本机回复用更深的竖线色区分。
- 校验：WXSS 括号 66/66 平衡；390px 渲染确认与设计稿逐项一致。

## 2026-10-28 修复「一起谈谈」跳到错误页面

- 现象：共同实践页点「一起谈谈」跳到了「此刻观察」页。
- 根因：该按钮绑定 `handleObservation()`，而其实现是 `wx.navigateTo({ url: '/pages/observation/index' })` —— 直接跳观察页，且先用 `entries.observation.enabled` 判断是否开放。设计稿的预期是进入**本期讨论页**。
- 修复：`handleObservation()` 改为跳转 `/pages/discussion/index`（不带参数），失败时 toast「本期讨论暂不可用」。
  - 选择不带参数的原因：`GET /api/content/discussion` 无参时接口会自动返回**当前已发布期刊**的讨论（实测返回 `issueCode: issue-02`），讨论页在拿到响应后会把真实 `issueCode` 写回 data，后续「写下我的经历 / 举报 / 留给自己观察」都能带正确的 code，无需在该页额外请求首页接口取 code。
- 审计：全项目跳转到 `pages/observation` 的入口已逐一核对——首页观察入口、我的页、实践页、记录详情「再次观察」、四时气韵「从现实处境开始」均为合理；仅「一起谈谈」一处错误，已修正。
- 校验：小程序 TS 编译通过。

## 2026-10-30 共同实践文案：列表化 + 按期存储（后台可维护）

### 问题
- 线上/线下文案与四条规则平铺为 30+ 个固定字段（`paragraph1-3`、`rule1Number/Title/Copy`…`rule4*`），段落与规则数量写死；
- 全局只有一份文案，换期需逐条重填，无按期版本。

### 1. 列表化（数量不限）
- 新结构：`onlineParagraphs: CopyItem[]`（原 `onlineCopy` 单段）、`rules: {number,title,copy}[]`（原 `rule1..4`）。
- 后端 `normalizeSharedPracticeCopy()` 在**读取时自动归一化**旧数据（旧扁平字段 → 列表），无需回填、不破坏历史数据；上限各 12 条。
- 小程序 `shared-practice` 页面改为 `wx:for` 渲染段落与规则；`utils/content.ts` 白名单与 `isCopyItem` 校验同步放开。

### 2. 按期存储
- 迁移 `057_issue_practice_copy.sql`：新表 `content_issue_practice_copy(issue_id PK, copy jsonb, updated_at, updated_by)`，一期一份。
- `GET /content/practice?issueCode=` 解析顺序：该期文案 → 全局默认值（缺失字段逐项回落）。
- 新增管理接口（AdminAuthGuard）：
  - `GET /content/practice-copy/manage?issueCode=` 返回 `{source: 'issue'|'global', copy}`
  - `PUT /content/practice-copy/manage` upsert（写审计）
  - `POST /content/practice-copy/manage/copy-from` 从另一期复制（写审计）

### 3. 后台编辑器
- 共同实践分区新增「按期文案」面板：期刊下拉选择、来源提示（该期独立文案 / 全局默认值）、「复制相邻期」。
- 段落区：添加/删除/上移/下移，每条含富文本 + 字号 + 颜色；
- 条目区：同样支持增删排序，每条含序号/标题/说明三个富文本字段；
- 保留原有「全局默认值」编辑区不变（作为未配置期数的回退）。

### 验证
- 后端 `tsc` 通过；后台 `vue-tsc + vite build` 通过；小程序 TS 编译通过、WXML view 32/32 平衡。
- 接口实测：保存前 `source=global`（1 段落 / 4 规则）→ PUT 保存 3 段落 / 5 规则 → 再读 `source=issue` 且 `GET /content/practice?issueCode=issue-02` 同步返回 3 段落 / 5 规则。
- 后台截图确认面板渲染：期刊选择器、来源提示、段落与条目列表、增删排序按钮均正常。
- 说明：「复制相邻期」因目前仅有一期（issue-02）无法实测，接口与按钮已就绪。