import { BadRequestException } from '@nestjs/common';

export const adminModuleIds = [
  'journal',
  'practice',
  'pages',
  'media',
  'contributions',
  'discussion-reports',
  'observations',
  'privacy',
  'members',
  'audit',
  'life-cards',
  'life-card-views',
  'settings',
] as const;

export type AdminModuleId = typeof adminModuleIds[number];

export type AdminModuleRule = { method: string; pattern: RegExp };

export interface AdminModuleDefinition {
  id: AdminModuleId;
  label: string;
  description: string;
  rules: AdminModuleRule[];
}

const uuid = '[0-9a-fA-F-]{36}';

/**
 * 员工可被单独授权的后台模块。每个模块只登记非超级管理员可以使用的路由：
 * 发布、删除媒体、停用会员、修改系统设置、员工管理等受控操作仍只允许超级管理员。
 */
export const adminModules: AdminModuleDefinition[] = [
  {
    id: 'journal',
    label: '期刊与首页策展',
    description: '期刊列表、首页栏目、人物故事、微声音、本期讨论与往期策展',
    rules: [
      { method: 'GET', pattern: /^\/content\/home$/ },
      { method: 'GET', pattern: /^\/content\/issues$/ },
      { method: 'GET', pattern: /^\/content\/issues\/summary$/ },
      { method: 'GET', pattern: /^\/content\/discussion\/manage$/ },
      { method: 'PUT', pattern: /^\/content\/discussion\/manage$/ },
      { method: 'POST', pattern: /^\/content\/discussion\/manage\/publish$/ },
      { method: 'GET', pattern: new RegExp(`^/content/issues/${uuid}/history$`) },
      { method: 'POST', pattern: /^\/content\/issues$/ },
      { method: 'PATCH', pattern: new RegExp(`^/content/issues/${uuid}$`) },
      { method: 'POST', pattern: new RegExp(`^/content/issues/${uuid}/publish$`) },
    ],
  },
  {
    id: 'practice',
    label: '实践页面与目录',
    description: '实践页面文案、实践目录设置、共同实践目录、此刻观察入口与日常之物',
    rules: [
      { method: 'GET', pattern: /^\/content\/practice\/manage$/ },
      { method: 'PATCH', pattern: /^\/content\/practice\/manage$/ },
      { method: 'GET', pattern: /^\/content\/practice-copy\/manage$/ },
      { method: 'PUT', pattern: /^\/content\/practice-copy\/manage$/ },
      { method: 'POST', pattern: /^\/content\/practice-copy\/manage\/copy-from$/ },
      { method: 'GET', pattern: /^\/content\/daily-objects\/manage$/ },
      { method: 'PATCH', pattern: /^\/content\/daily-objects\/manage$/ },
    ],
  },
  {
    id: 'pages',
    label: '页面与协议',
    description: '隐私政策、用户协议草稿与导入、关于 MYRIAD SHE 与发布历史',
    rules: [
      { method: 'GET', pattern: /^\/content\/privacy-policy\/manage$/ },
      { method: 'PATCH', pattern: /^\/content\/privacy-policy\/manage$/ },
      { method: 'GET', pattern: /^\/content\/legal-documents\/(privacy-policy|user-agreement)\/manage$/ },
      { method: 'PATCH', pattern: /^\/content\/legal-documents\/(privacy-policy|user-agreement)\/manage$/ },
      { method: 'POST', pattern: /^\/content\/legal-documents\/(privacy-policy|user-agreement)\/import$/ },
      { method: 'GET', pattern: /^\/content\/privacy-revisions\/(privacy-policy|user-agreement|about-page)$/ },
      { method: 'GET', pattern: /^\/content\/about\/manage$/ },
      { method: 'PATCH', pattern: /^\/content\/about\/manage$/ },
    ],
  },
  {
    id: 'media',
    label: '媒体库',
    description: '图片与音频上传、孤儿媒体查询和预览地址（删除仍仅超级管理员）',
    rules: [
      { method: 'POST', pattern: /^\/content\/media\/upload-url$/ },
      { method: 'GET', pattern: /^\/content\/media\/(orphans|audio|view-url|preview-url)$/ },
    ],
  },
  {
    id: 'contributions',
    label: '用户经历审核',
    description: '本期讨论的经历与回复留言列表、详情与审核状态',
    rules: [
      { method: 'GET', pattern: /^\/admin\/discussion-contributions$/ },
      { method: 'GET', pattern: new RegExp(`^/admin/discussion-contributions/${uuid}$`) },
      { method: 'PATCH', pattern: new RegExp(`^/admin/discussion-contributions/${uuid}/status$`) },
    ],
  },
  {
    id: 'discussion-reports',
    label: '用户举报',
    description: '用户举报的讨论内容、原因与处理状态',
    rules: [
      { method: 'GET', pattern: /^\/admin\/discussion-reports$/ },
      { method: 'PATCH', pattern: new RegExp(`^/admin/discussion-reports/${uuid}/status$`) },
    ],
  },
  {
    id: 'observations',
    label: '观察记录管理',
    description: '私密观察记录列表、生命周期统计与单条详情',
    rules: [
      { method: 'GET', pattern: /^\/admin\/observations$/ },
      { method: 'GET', pattern: /^\/admin\/observations\/lifecycle$/ },
      { method: 'GET', pattern: new RegExp(`^/admin/observations/${uuid}$`) },
    ],
  },
  {
    id: 'privacy',
    label: '隐私申请',
    description: '账户删除申请列表、处理、重试与用户数据导出',
    rules: [
      { method: 'GET', pattern: /^\/admin\/privacy-requests$/ },
      { method: 'POST', pattern: new RegExp(`^/admin/privacy-requests/${uuid}/process$`) },
      { method: 'POST', pattern: new RegExp(`^/admin/privacy-requests/${uuid}/retry$`) },
    ],
  },
  {
    id: 'members',
    label: '会员列表',
    description: '会员目录与会员详情（停用/恢复仍仅超级管理员）',
    rules: [
      { method: 'GET', pattern: /^\/admin\/users$/ },
      { method: 'GET', pattern: new RegExp(`^/admin/users/${uuid}$`) },
    ],
  },
  {
    id: 'audit',
    label: '审计日志',
    description: '后台操作审计日志查询',
    rules: [{ method: 'GET', pattern: /^\/admin\/audit-logs$/ }],
  },
  {
    id: 'life-cards',
    label: '生命牌文案',
    description: '生命牌文案列表、导入、导出与逐日编辑',
    rules: [
      { method: 'GET', pattern: /^\/content\/life-cards\/manage$/ },
      { method: 'GET', pattern: /^\/content\/life-cards\/manage\/export$/ },
      { method: 'POST', pattern: /^\/content\/life-cards\/manage\/import$/ },
      { method: 'PATCH', pattern: /^\/content\/life-cards\/manage\/\d{1,2}\/\d{1,2}$/ },
    ],
  },
  {
    id: 'life-card-views',
    label: '生命牌查看记录',
    description: '小程序生命牌查看记录',
    rules: [{ method: 'GET', pattern: /^\/content\/life-card-views\/manage$/ }],
  },
  {
    id: 'settings',
    label: '系统设置',
    description: '业务设置只读与数据库迁移状态（保存仍仅超级管理员）',
    rules: [
      { method: 'GET', pattern: /^\/admin\/system-settings$/ },
      { method: 'GET', pattern: /^\/admin\/system\/migrations$/ },
    ],
  },
];

const adminModuleIdsSet = new Set<string>(adminModuleIds);

export const adminRoleDefaultModules: Record<string, AdminModuleId[]> = {
  super_admin: [...adminModuleIds],
  content_editor: ['journal', 'practice', 'pages', 'media', 'contributions', 'discussion-reports'],
  support_readonly: ['members', 'settings'],
};

export function isAdminModuleId(value: unknown): value is AdminModuleId {
  return typeof value === 'string' && adminModuleIdsSet.has(value);
}

/**
 * null 表示跟随角色默认授权；空数组表示显式不授权任何模块。
 * 返回 undefined 表示请求体没有携带这个字段，调用方应保持原值。
 */
export function parseAdminModuleOverride(value: unknown): AdminModuleId[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Array.isArray(value) || value.length > adminModuleIds.length) throw new BadRequestException('模块授权无效');
  const unique: AdminModuleId[] = [];
  for (const item of value) {
    if (!isAdminModuleId(item)) throw new BadRequestException('模块授权包含未登记的模块');
    if (!unique.includes(item)) unique.push(item);
  }
  return unique;
}

export function effectiveAdminModules(role: string, override?: readonly string[] | null): AdminModuleId[] {
  const source = override ?? adminRoleDefaultModules[role] ?? [];
  const result: AdminModuleId[] = [];
  for (const item of source) {
    if (isAdminModuleId(item) && !result.includes(item)) result.push(item);
  }
  return result;
}

/**
 * 模块授权对每个角色都生效（超级管理员默认拥有全部模块，也可以被单独收窄）。
 * 没有登记在任何模块里的接口属于超级管理员专用操作，只按角色放行。
 */
export function adminModulesAllow(role: string, override: readonly string[] | null | undefined, method: string, path: string) {
  const modules = effectiveAdminModules(role, override);
  const matched = adminModules.filter((definition) => definition.rules.some((rule) => rule.method === method && rule.pattern.test(path)));
  if (matched.length === 0) return role === 'super_admin';
  return matched.some((definition) => modules.includes(definition.id));
}
