<script setup lang="ts">
import { computed, ref } from 'vue';
import type { MemberDetail } from '../member-profile';

const props = defineProps<{ member: MemberDetail; isSuperAdmin: boolean }>();
const emit = defineEmits<{ close: [] }>();
const identifiersOpen = ref(false);
const copiedLabel = ref('');
const copyMessage = ref('');
const birthday = computed(() => {
  const { birthMonth: month, birthDay: day } = props.member;
  return Number.isInteger(month) && Number.isInteger(day) && month && day ? `${month} 月 ${day} 日` : '';
});
const address = computed(() => {
  if (!props.isSuperAdmin || !props.member.address) return '';
  const { provinceName, cityName, countyName, detailInfo } = props.member.address;
  return [provinceName, cityName, countyName, detailInfo].filter(Boolean).join(' ');
});
const identifiers = computed(() => [
  { label: '会员编号', value: props.member.id },
  { label: '微信 OpenID', value: props.member.openId },
  { label: '微信 UnionID', value: props.member.maskedUnionId },
]);
const privacyStatusLabels: Record<string, string> = { pending: '待处理', processing: '处理中', completed: '已完成', cancelled: '已取消', failed: '处理失败' };
function formatDate(value: string, withTime = false) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value || '未提供';
  return withTime ? date.toLocaleString('zh-CN', { hour12: false }) : date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}
async function copyIdentifier(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value);
    copiedLabel.value = label;
    copyMessage.value = `${label}已复制`;
  } catch {
    copiedLabel.value = '';
    copyMessage.value = '复制失败，请选择编号手动复制。';
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="observation-modal-backdrop member-detail-backdrop" @click.self="emit('close')">
      <section class="observation-detail-panel member-detail-dialog" role="dialog" aria-modal="true" aria-label="会员详情" @keydown.esc.stop="emit('close')">
        <header class="section-heading member-detail-header">
          <p class="member-detail-eyebrow">MYRIAD SHE / MEMBER</p>
          <button type="button" class="member-detail-close" aria-label="关闭会员详情" @click="emit('close')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
        </header>
        <div class="panel-body member-detail-body">
          <header class="member-profile-heading">
            <img v-if="member.avatarUrl" class="member-profile-avatar" :src="member.avatarUrl" alt="" width="52" height="52" decoding="async" />
            <span v-else class="member-profile-avatar member-profile-initial" aria-hidden="true">{{ Array.from(member.nickname || 'M')[0] }}</span>
            <div class="member-profile-identity">
              <div class="member-profile-name-row"><h2>{{ member.nickname || '未设置昵称' }}</h2><span class="member-profile-status" :class="{ 'is-suspended': member.status !== 'active' }">{{ member.status === 'active' ? '正常' : '已停用' }}</span></div>
              <p class="member-profile-joined"><time :datetime="member.createdAt">{{ formatDate(member.createdAt) }}</time>加入</p>
            </div>
          </header>

          <dl class="member-profile-fields" aria-label="基本资料">
            <div><dt>手机号</dt><dd :class="{ 'member-profile-empty': !member.phoneNumber && !member.phoneMasked }">{{ member.phoneNumber || member.phoneMasked || '未绑定' }}</dd></div>
            <div><dt>生日</dt><dd :class="{ 'member-profile-empty': !birthday }">{{ birthday || '未填写' }}</dd></div>
            <div class="member-profile-wide"><dt>收货地址</dt><dd :class="{ 'member-profile-empty': !address }">{{ isSuperAdmin ? address || '未填写' : '仅超级管理员可见' }}</dd></div>
          </dl>

          <dl class="member-profile-fields member-profile-activity" aria-label="会员记录">
            <div><dt>观察记录</dt><dd>{{ member.observationCount }} 条</dd></div>
            <div><dt>隐私申请</dt><dd>{{ member.privacyRequests?.length ? `${member.privacyRequests.length} 条申请` : '暂无申请' }}</dd></div>
          </dl>
          <section v-if="member.privacyRequests?.length" class="member-profile-privacy" aria-label="账户隐私申请">
            <ol><li v-for="request in member.privacyRequests" :key="request.id"><strong :class="{ 'member-privacy-failed': request.status === 'failed' }">{{ privacyStatusLabels[request.status] || request.status }}</strong><span>申请于 {{ formatDate(request.requestedAt, true) }}</span><span>计划处理 {{ formatDate(request.scheduledFor, true) }}</span></li></ol>
            <p v-if="!isSuperAdmin">申请处理由超级管理员负责。</p>
          </section>

          <details class="member-profile-identifiers" @toggle="identifiersOpen = ($event.target as HTMLDetailsElement).open">
            <summary><span>账户标识</span><span class="member-profile-disclosure">{{ identifiersOpen ? '收起' : '展开' }}<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg></span></summary>
            <dl class="member-profile-fields">
              <div v-for="identifier in identifiers" :key="identifier.label" class="member-profile-wide">
                <dt>{{ identifier.label }}</dt>
                <dd class="member-profile-identifier"><span>{{ identifier.value || '未提供' }}</span><button v-if="identifier.value" type="button" class="member-profile-copy" :aria-label="`复制${identifier.label}`" @click="copyIdentifier(identifier.label, identifier.value)">{{ copiedLabel === identifier.label ? '已复制' : '复制' }}</button></dd>
              </div>
              <div class="member-profile-wide"><dt>注册时间</dt><dd><time :datetime="member.createdAt">{{ formatDate(member.createdAt, true) }}</time></dd></div>
            </dl>
            <p class="member-profile-copy-message" role="status" aria-live="polite">{{ copyMessage }}</p>
          </details>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.member-detail-dialog {
  gap: 0;
  width: min(680px, 100%) !important;
  max-width: 680px !important;
  max-height: min(88dvh, 900px) !important;
  border-radius: 8px !important;
  background: var(--surface-paper) !important;
  box-shadow: 0 20px 60px rgb(var(--brand-ochre-rgb) / 14%) !important;
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
}
.member-detail-dialog > .member-detail-header { flex-direction: row; align-items: center; padding: 32px 44px 0 !important; border: 0; background: transparent; }
.member-detail-eyebrow { margin: 0; color: var(--muted); font-family: "MYRIAD Garamond", "MYRIAD Song", serif; font-size: 11px; letter-spacing: .14em; line-height: 1.6; }
.member-detail-dialog .member-detail-close { display: grid; flex: 0 0 44px; place-items: center; width: 44px; min-height: 44px; margin: -12px -12px -12px 0; padding: 12px; border: 0; border-radius: 4px; background: transparent; color: var(--muted); box-shadow: none; }
.member-detail-close svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.4; }
.member-detail-dialog > .member-detail-body { margin: 0; padding: 28px 44px 40px; }
.member-detail-dialog .member-detail-body > * { margin: 0; }
.member-profile-heading { display: flex; align-items: center; gap: 18px; }
.member-profile-avatar { display: block; flex: 0 0 52px; width: 52px; height: 52px; border-radius: 50%; object-fit: cover; background: var(--surface-3); }
.member-profile-initial { display: grid; place-items: center; color: var(--accent); font: 24px/1 "MYRIAD Song", serif; }
.member-profile-identity { flex: 1; min-width: 0; }
.member-profile-name-row { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px 18px; }
.member-profile-name-row h2 { margin: 0; font-family: "MYRIAD Garamond", "MYRIAD Song", serif; font-size: 28px; font-weight: 400; line-height: 1.5; overflow-wrap: anywhere; }
.member-profile-status { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 6px; color: var(--ok); font-size: 12px; line-height: 1.6; }
.member-profile-status::before { content: ''; width: 4px; height: 4px; border-radius: 50%; background: currentColor; }
.member-profile-status.is-suspended { color: var(--danger); }
.member-profile-joined { margin: 5px 0 0; color: var(--muted); font-size: 12px; line-height: 1.8; }
.member-profile-joined time { margin-right: 4px; }
.member-profile-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 26px 40px; padding: 0; }
.member-detail-body > .member-profile-fields { margin-top: 34px; }
.member-profile-fields > div { min-width: 0; }
.member-profile-fields dt { margin: 0 0 8px; color: var(--muted); font-size: 12px; line-height: 1.6; }
.member-profile-fields dd { margin: 0; color: var(--ink); font-size: 15px; line-height: 1.8; overflow-wrap: anywhere; }
.member-profile-fields dd.member-profile-empty { color: var(--muted); font-size: 14px; }
.member-profile-wide { grid-column: 1 / -1; }
.member-detail-body > .member-profile-activity { margin-top: 32px; padding-top: 28px; border-top: 1px solid var(--line); }
.member-profile-activity dd { font-size: 14px; }
.member-detail-body > .member-profile-privacy { margin-top: 20px; }
.member-profile-privacy ol { display: grid; gap: 16px; margin: 0; padding: 0; list-style: none; }
.member-profile-privacy li { display: grid; gap: 4px; font-size: 12px; line-height: 1.8; color: var(--muted); overflow-wrap: anywhere; }
.member-profile-privacy strong { color: var(--ink); font-size: 13px; font-weight: 500; }
.member-profile-privacy strong.member-privacy-failed { color: var(--danger); }
.member-profile-privacy p { margin: 12px 0 0; color: var(--muted); font-size: 12px; }
.member-detail-body > .member-profile-identifiers { margin-top: 32px; border-top: 1px solid var(--line); }
.member-profile-identifiers summary { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 60px; padding: 16px 0 0; list-style: none; color: var(--muted); font-size: 12px; line-height: 1.6; cursor: pointer; }
.member-profile-identifiers summary::-webkit-details-marker { display: none; }
.member-profile-disclosure { display: inline-flex; align-items: center; gap: 8px; color: var(--accent); }
.member-profile-disclosure svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.3; }
.member-profile-identifiers[open] .member-profile-disclosure svg { transform: rotate(180deg); }
.member-profile-identifiers .member-profile-fields { margin-top: 24px; gap: 20px; }
.member-profile-identifiers dd { color: var(--ink-2); font-size: 12px; }
.member-profile-identifier { display: flex; align-items: flex-start; gap: 12px; }
.member-profile-identifier > span { flex: 1; min-width: 0; font-family: "SFMono-Regular", Consolas, monospace; }
.member-detail-dialog .member-profile-copy { flex: 0 0 auto; min-width: 44px; min-height: 44px; margin: -10px -10px -10px 0; padding: 10px; border: 0; border-radius: 4px; background: transparent; color: var(--accent); font-family: inherit; font-size: 12px; line-height: 1.8; box-shadow: none; }
.member-detail-dialog :is(.member-detail-close, .member-profile-copy):hover { background: var(--accent-soft); color: var(--accent); transform: none; box-shadow: none; }
.member-detail-dialog :is(button, summary):focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.member-profile-copy-message { margin: 16px 0 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.member-profile-copy-message:empty { display: none; }
@media (max-width: 560px) {
  .member-detail-dialog > .member-detail-header { padding: 24px 24px 0 !important; }
  .member-detail-dialog > .member-detail-body { padding: 24px 24px 28px; }
  .member-profile-fields { gap: 24px; }
  .member-profile-name-row { column-gap: 12px; }
  .member-profile-name-row h2 { font-size: 25px; }
}
@media (max-width: 360px) { .member-profile-fields { grid-template-columns: minmax(0, 1fr); } }
</style>
