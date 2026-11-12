<script setup lang="ts">
import { computed } from 'vue';
import PhonePreview from './PhonePreview.vue';
import RichTextView from './RichTextView.vue';

interface CopyItem {
  richText?: string;
  fontSize?: number;
  color?: string;
}

type SeasonIntroCopyKey = 'navTitle' | 'metaLeft' | 'metaRight' | 'heroTitle' | 'heroDescription' | 'guideTitle' | 'guideRequired' | 'guideRead' | 'guideParagraphOne' | 'guideParagraphTwo' | 'guideSteps' | 'guideGateNote' | 'guideConfirm' | 'birthdayLabel' | 'monthLabel' | 'dayLabel' | 'monthPlaceholder' | 'dayPlaceholder' | 'birthdayNote' | 'rememberTitle' | 'rememberNote' | 'primaryAction' | 'primaryLockedAction' | 'realityAction' | 'skipAction';

interface SeasonIntroCopy extends Record<SeasonIntroCopyKey, CopyItem> {
  align?: 'left' | 'center' | 'right';
  spacing?: 'compact' | 'standard' | 'roomy';
}

const props = defineProps<{
  copy: SeasonIntroCopy;
  activeKey: string;
}>();

const emit = defineEmits<{ (event: 'pick', key: string): void }>();

const alignment = computed(() => props.copy.align || 'left');
const spacing = computed(() => props.copy.spacing || 'standard');

const itemStyle = (item: CopyItem) => ({
  fontSize: `${item.fontSize || 14}px`,
  color: item.color || '#4a3f38',
});

const previewKey = (field: SeasonIntroCopyKey) => `season:${field}`;
const pick = (field: SeasonIntroCopyKey) => emit('pick', previewKey(field));
const isActive = (field: SeasonIntroCopyKey) => props.activeKey === previewKey(field);
</script>

<template>
  <PhonePreview class="season-intro-phone" title="四时气韵入口页" caption="SEASON INTRO" :active-key="activeKey">
    <div :class="['season-intro-preview', `season-intro-align-${alignment}`, `season-intro-spacing-${spacing}`]">
      <nav class="season-preview-nav" aria-label="页面导航">
        <span aria-hidden="true">‹</span>
        <div
          :data-preview-key="previewKey('navTitle')"
          :class="['preview-block', 'season-preview-nav-title', { 'is-preview-active': isActive('navTitle') }]"
          :style="itemStyle(copy.navTitle)"
          @click="pick('navTitle')"
        ><RichTextView :text="copy.navTitle?.richText" :rich-text="copy.navTitle?.richText" fallback="四时气韵" :inline="true" /></div>
        <span class="season-preview-more" aria-hidden="true">···</span>
      </nav>

      <div class="season-preview-meta">
        <div
          :data-preview-key="previewKey('metaLeft')"
          :class="['preview-block', { 'is-preview-active': isActive('metaLeft') }]"
          :style="itemStyle(copy.metaLeft)"
          @click="pick('metaLeft')"
        ><RichTextView :text="copy.metaLeft?.richText" :rich-text="copy.metaLeft?.richText" fallback="四时气韵" :inline="true" /></div>
        <div
          :data-preview-key="previewKey('metaRight')"
          :class="['preview-block', { 'is-preview-active': isActive('metaRight') }]"
          :style="itemStyle(copy.metaRight)"
          @click="pick('metaRight')"
        ><RichTextView :text="copy.metaRight?.richText" :rich-text="copy.metaRight?.richText" fallback="从生命牌开始" :inline="true" /></div>
      </div>

      <section class="season-preview-hero">
        <div
          :data-preview-key="previewKey('heroTitle')"
          :class="['preview-block', 'season-preview-title', { 'is-preview-active': isActive('heroTitle') }]"
          :style="itemStyle(copy.heroTitle)"
          @click="pick('heroTitle')"
        ><RichTextView :text="copy.heroTitle?.richText" :rich-text="copy.heroTitle?.richText" fallback="从一个生日，开启一次观察。" /></div>
        <div
          :data-preview-key="previewKey('heroDescription')"
          :class="['preview-block', 'season-preview-lead', { 'is-preview-active': isActive('heroDescription') }]"
          :style="itemStyle(copy.heroDescription)"
          @click="pick('heroDescription')"
        ><RichTextView :text="copy.heroDescription?.richText" :rich-text="copy.heroDescription?.richText" fallback="按生日找到对应的生命牌，借它的主题回看一件真实的事。" /></div>
      </section>

      <section class="season-preview-guide">
        <div class="season-preview-guide-head">
          <span class="season-preview-caret" aria-hidden="true">▾</span>
          <div
            :data-preview-key="previewKey('guideTitle')"
            :class="['preview-block', 'season-preview-guide-title', { 'is-preview-active': isActive('guideTitle') }]"
            :style="itemStyle(copy.guideTitle)"
            @click="pick('guideTitle')"
          ><RichTextView :text="copy.guideTitle?.richText" :rich-text="copy.guideTitle?.richText" fallback="生命牌与四时气韵是什么？" :inline="true" /></div>
        </div>

        <div class="season-preview-statuses" aria-label="说明状态文案">
          <span>状态文案</span>
          <div
            :data-preview-key="previewKey('guideRequired')"
            :class="['preview-block', 'season-preview-status', { 'is-preview-active': isActive('guideRequired') }]"
            :style="itemStyle(copy.guideRequired)"
            @click="pick('guideRequired')"
          ><RichTextView :text="copy.guideRequired?.richText" :rich-text="copy.guideRequired?.richText" fallback="必读" :inline="true" /></div>
          <div
            :data-preview-key="previewKey('guideRead')"
            :class="['preview-block', 'season-preview-status', 'is-read', { 'is-preview-active': isActive('guideRead') }]"
            :style="itemStyle(copy.guideRead)"
            @click="pick('guideRead')"
          ><RichTextView :text="copy.guideRead?.richText" :rich-text="copy.guideRead?.richText" fallback="已读" :inline="true" /></div>
        </div>

        <div
          :data-preview-key="previewKey('guideParagraphOne')"
          :class="['preview-block', 'season-preview-paragraph', { 'is-preview-active': isActive('guideParagraphOne') }]"
          :style="itemStyle(copy.guideParagraphOne)"
          @click="pick('guideParagraphOne')"
        ><RichTextView :text="copy.guideParagraphOne?.richText" :rich-text="copy.guideParagraphOne?.richText" fallback="生命牌来自一种以生日对应纸牌的传统符号体系。" /></div>
        <div
          :data-preview-key="previewKey('guideParagraphTwo')"
          :class="['preview-block', 'season-preview-paragraph', { 'is-preview-active': isActive('guideParagraphTwo') }]"
          :style="itemStyle(copy.guideParagraphTwo)"
          @click="pick('guideParagraphTwo')"
        ><RichTextView :text="copy.guideParagraphTwo?.richText" :rich-text="copy.guideParagraphTwo?.richText" fallback="生日只用于查表，牌义不决定你是谁。" /></div>
        <div
          :data-preview-key="previewKey('guideSteps')"
          :class="['preview-block', 'season-preview-steps', { 'is-preview-active': isActive('guideSteps') }]"
          :style="itemStyle(copy.guideSteps)"
          @click="pick('guideSteps')"
        ><RichTextView :text="copy.guideSteps?.richText" :rich-text="copy.guideSteps?.richText" fallback="底色 → 此刻 → 选择 → 行动" :inline="true" /></div>
        <div
          :data-preview-key="previewKey('guideGateNote')"
          :class="['preview-block', 'season-preview-gate-note', { 'is-preview-active': isActive('guideGateNote') }]"
          :style="itemStyle(copy.guideGateNote)"
          @click="pick('guideGateNote')"
        ><RichTextView :text="copy.guideGateNote?.richText" :rich-text="copy.guideGateNote?.richText" fallback="开始前，请先阅读以上说明并确认了解。" /></div>
        <div
          :data-preview-key="previewKey('guideConfirm')"
          :class="['preview-block', 'season-preview-confirm', { 'is-preview-active': isActive('guideConfirm') }]"
          :style="itemStyle(copy.guideConfirm)"
          @click="pick('guideConfirm')"
        ><RichTextView :text="copy.guideConfirm?.richText" :rich-text="copy.guideConfirm?.richText" fallback="我已了解，开始选择生日" :inline="true" /></div>
      </section>

      <section class="season-preview-form">
        <div
          :data-preview-key="previewKey('birthdayLabel')"
          :class="['preview-block', 'season-preview-birthday-label', { 'is-preview-active': isActive('birthdayLabel') }]"
          :style="itemStyle(copy.birthdayLabel)"
          @click="pick('birthdayLabel')"
        ><RichTextView :text="copy.birthdayLabel?.richText" :rich-text="copy.birthdayLabel?.richText" fallback="你的公历生日" :inline="true" /></div>
        <div class="season-preview-birth-row">
          <div class="season-preview-birth-field">
            <div
              :data-preview-key="previewKey('monthLabel')"
              :class="['preview-block', 'season-preview-birth-caption', { 'is-preview-active': isActive('monthLabel') }]"
              :style="itemStyle(copy.monthLabel)"
              @click="pick('monthLabel')"
            ><RichTextView :text="copy.monthLabel?.richText" :rich-text="copy.monthLabel?.richText" fallback="月" :inline="true" /></div>
            <div
              :data-preview-key="previewKey('monthPlaceholder')"
              :class="['preview-block', 'season-preview-birth-value', { 'is-preview-active': isActive('monthPlaceholder') }]"
              :style="itemStyle(copy.monthPlaceholder)"
              @click="pick('monthPlaceholder')"
            ><RichTextView :text="copy.monthPlaceholder?.richText" :rich-text="copy.monthPlaceholder?.richText" fallback="选择月份" :inline="true" /></div>
          </div>
          <div class="season-preview-birth-field">
            <div
              :data-preview-key="previewKey('dayLabel')"
              :class="['preview-block', 'season-preview-birth-caption', { 'is-preview-active': isActive('dayLabel') }]"
              :style="itemStyle(copy.dayLabel)"
              @click="pick('dayLabel')"
            ><RichTextView :text="copy.dayLabel?.richText" :rich-text="copy.dayLabel?.richText" fallback="日" :inline="true" /></div>
            <div
              :data-preview-key="previewKey('dayPlaceholder')"
              :class="['preview-block', 'season-preview-birth-value', { 'is-preview-active': isActive('dayPlaceholder') }]"
              :style="itemStyle(copy.dayPlaceholder)"
              @click="pick('dayPlaceholder')"
            ><RichTextView :text="copy.dayPlaceholder?.richText" :rich-text="copy.dayPlaceholder?.richText" fallback="选择日期" :inline="true" /></div>
          </div>
        </div>
        <div
          :data-preview-key="previewKey('birthdayNote')"
          :class="['preview-block', 'season-preview-birth-note', { 'is-preview-active': isActive('birthdayNote') }]"
          :style="itemStyle(copy.birthdayNote)"
          @click="pick('birthdayNote')"
        ><RichTextView :text="copy.birthdayNote?.richText" :rich-text="copy.birthdayNote?.richText" fallback="只需月与日。同一天生日对应同一张生命牌。" /></div>
      </section>

      <div class="season-preview-remember">
        <span class="season-preview-checkbox" aria-hidden="true" />
        <div class="season-preview-remember-copy">
          <div
            :data-preview-key="previewKey('rememberTitle')"
            :class="['preview-block', 'season-preview-remember-title', { 'is-preview-active': isActive('rememberTitle') }]"
            :style="itemStyle(copy.rememberTitle)"
            @click="pick('rememberTitle')"
          ><RichTextView :text="copy.rememberTitle?.richText" :rich-text="copy.rememberTitle?.richText" fallback="在这台设备记住生日" :inline="true" /></div>
          <div
            :data-preview-key="previewKey('rememberNote')"
            :class="['preview-block', 'season-preview-remember-note', { 'is-preview-active': isActive('rememberNote') }]"
            :style="itemStyle(copy.rememberNote)"
            @click="pick('rememberNote')"
          ><RichTextView :text="copy.rememberNote?.richText" :rich-text="copy.rememberNote?.richText" fallback="下次可直接继续观察；随时可以清除。" :inline="true" /></div>
        </div>
      </div>

      <div
        :data-preview-key="previewKey('primaryAction')"
        :class="['preview-block', 'season-preview-primary', { 'is-preview-active': isActive('primaryAction') }]"
        :style="itemStyle(copy.primaryAction)"
        @click="pick('primaryAction')"
      ><RichTextView :text="copy.primaryAction?.richText" :rich-text="copy.primaryAction?.richText" fallback="查看我的生命牌" :inline="true" /></div>
      <div class="season-preview-locked-state">
        <span>锁定态</span>
        <div
          :data-preview-key="previewKey('primaryLockedAction')"
          :class="['preview-block', 'season-preview-locked-copy', { 'is-preview-active': isActive('primaryLockedAction') }]"
          :style="itemStyle(copy.primaryLockedAction)"
          @click="pick('primaryLockedAction')"
        ><RichTextView :text="copy.primaryLockedAction?.richText" :rich-text="copy.primaryLockedAction?.richText" fallback="请先阅读并确认了解" :inline="true" /></div>
      </div>
      <div
        :data-preview-key="previewKey('realityAction')"
        :class="['preview-block', 'season-preview-secondary', { 'is-preview-active': isActive('realityAction') }]"
        :style="itemStyle(copy.realityAction)"
        @click="pick('realityAction')"
      ><RichTextView :text="copy.realityAction?.richText" :rich-text="copy.realityAction?.richText" fallback="从现实处境开始" :inline="true" /></div>
      <div
        :data-preview-key="previewKey('skipAction')"
        :class="['preview-block', 'season-preview-skip', { 'is-preview-active': isActive('skipAction') }]"
        :style="itemStyle(copy.skipAction)"
        @click="pick('skipAction')"
      ><RichTextView :text="copy.skipAction?.richText" :rich-text="copy.skipAction?.richText" fallback="暂不使用四时气韵" :inline="true" /></div>
    </div>

    <template #tabbar>
      <nav class="season-preview-tabbar" aria-label="主导航">
        <span><i class="home-icon" />首页</span>
        <span class="is-selected"><i class="practice-icon" /><b>实践</b></span>
        <span><i class="mine-icon" />我的</span>
      </nav>
    </template>
  </PhonePreview>
</template>

<style scoped>
.season-intro-preview { min-height: 100%; margin: -8px -20px -30px; padding: 8px 20px 32px; background: #e7dfd1; color: #4a3f38; font-family: Georgia, 'Songti SC', 'STSong', serif; box-sizing: border-box; }
.season-preview-nav { display: grid; grid-template-columns: 28px minmax(0, 1fr) 36px; height: 42px; align-items: center; border-bottom: 1px solid rgba(92, 73, 60, .18); text-align: center; }
.season-preview-nav > span { color: #5c493c; font-size: 17px; }
.season-preview-nav-title { min-width: 0; color: #5c493c; font-weight: 600; }
.season-preview-more { font-size: 10px; letter-spacing: 1px; }
.season-preview-meta { display: flex; justify-content: space-between; gap: 18px; margin-top: 15px; color: #8b6b58; letter-spacing: .04em; line-height: 1.5; }
.season-preview-hero { margin-top: 22px; }
.season-preview-title { color: #4a3f38; font-weight: 600; line-height: 1.45; }
.season-preview-lead { margin-top: 17px; color: #4a3f38; line-height: 1.85; }
.season-preview-guide { margin-top: 23px; padding: 11px 0 15px; border-top: 1px solid rgba(92, 73, 60, .2); border-bottom: 1px solid rgba(92, 73, 60, .2); }
.season-preview-guide-head { display: flex; align-items: center; gap: 7px; }
.season-preview-caret { color: #7b5a45; font-size: 9px; }
.season-preview-guide-title { color: #4a3f38; font-weight: 600; line-height: 1.55; }
.season-preview-statuses { display: flex; align-items: center; gap: 6px; margin-top: 7px; padding-left: 16px; color: #9a897b; font-family: -apple-system, 'PingFang SC', sans-serif; font-size: 8px; }
.season-preview-status { padding: 1px 5px; border: 1px solid rgba(102, 49, 36, .35); color: #663124; font-size: 9px; line-height: 1.5; }
.season-preview-status.is-read { border-color: rgba(139, 107, 88, .35); color: #8b6b58; }
.season-preview-paragraph { margin-top: 9px; color: #5b4c42; line-height: 1.95; }
.season-preview-steps { margin-top: 1px; color: #7b5a45; line-height: 1.7; letter-spacing: .03em; }
.season-preview-gate-note { margin-top: 8px; color: #7b5a45; line-height: 1.65; }
.season-preview-confirm { display: flex; min-height: 38px; align-items: center; justify-content: center; margin-top: 8px; background: #663124; color: #fffaf4; text-align: center; }
.season-preview-form { margin-top: 20px; }
.season-preview-birthday-label { color: #4a3f38; font-weight: 600; line-height: 1.5; }
.season-preview-birth-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 28px; margin-top: 13px; }
.season-preview-birth-caption { color: #8b6b58; line-height: 1.4; }
.season-preview-birth-value { margin-top: 7px; padding-bottom: 8px; border-bottom: 1px solid #b9a794; color: #a1907f; line-height: 1.4; }
.season-preview-birth-note { margin-top: 11px; color: #8b6b58; line-height: 1.6; }
.season-preview-remember { display: flex; align-items: flex-start; gap: 8px; margin-top: 22px; }
.season-preview-checkbox { flex: 0 0 12px; width: 12px; height: 12px; margin-top: 3px; border: 1px solid #8b6b58; box-sizing: border-box; }
.season-preview-remember-copy { display: grid; gap: 3px; min-width: 0; }
.season-preview-remember-title { color: #4a3f38; line-height: 1.5; }
.season-preview-remember-note { color: #8b6b58; line-height: 1.6; }
.season-preview-primary { display: flex; min-height: 43px; align-items: center; justify-content: center; margin-top: 17px; border-radius: 2px; background: #663124; color: #fffaf4; text-align: center; letter-spacing: .03em; }
.season-preview-locked-state { display: flex; align-items: center; gap: 7px; margin-top: 7px; padding: 5px 8px; border: 1px dashed #c5b5a6; color: #8b6b58; font-family: -apple-system, 'PingFang SC', sans-serif; font-size: 8px; }
.season-preview-locked-copy { color: #8b6b58; font-size: 10px; }
.season-preview-secondary { display: flex; min-height: 43px; align-items: center; justify-content: center; margin-top: 22px; border: 1px solid #7c6552; color: #4a3f38; text-align: center; }
.season-preview-skip { display: flex; min-height: 34px; align-items: center; justify-content: center; margin-top: 12px; color: #8b6b58; text-align: center; }
.season-intro-align-center .season-preview-meta { justify-content: center; gap: 22px; }
.season-intro-align-right .season-preview-meta { justify-content: flex-end; gap: 22px; }
.season-intro-align-center .season-preview-hero,
.season-intro-align-center .season-preview-guide,
.season-intro-align-center .season-preview-form,
.season-intro-align-center .season-preview-remember-copy { text-align: center; }
.season-intro-align-right .season-preview-hero,
.season-intro-align-right .season-preview-guide,
.season-intro-align-right .season-preview-form,
.season-intro-align-right .season-preview-remember-copy { text-align: right; }
.season-intro-align-center .season-preview-guide-head { justify-content: center; }
.season-intro-align-right .season-preview-guide-head { justify-content: flex-end; }
.season-intro-align-center .season-preview-statuses { justify-content: center; padding-left: 0; }
.season-intro-align-right .season-preview-statuses { justify-content: flex-end; padding-left: 0; }
.season-intro-align-center .season-preview-remember { justify-content: center; }
.season-intro-align-right .season-preview-remember { justify-content: flex-end; }
.season-intro-spacing-compact .season-preview-hero { margin-top: 14px; }
.season-intro-spacing-compact .season-preview-lead { margin-top: 11px; }
.season-intro-spacing-compact .season-preview-guide { margin-top: 15px; padding-top: 7px; padding-bottom: 10px; }
.season-intro-spacing-compact .season-preview-form { margin-top: 13px; }
.season-intro-spacing-compact .season-preview-birth-row { margin-top: 9px; }
.season-intro-spacing-compact .season-preview-birth-note { margin-top: 7px; }
.season-intro-spacing-compact .season-preview-remember { margin-top: 15px; }
.season-intro-spacing-compact .season-preview-primary { margin-top: 12px; }
.season-intro-spacing-compact .season-preview-secondary { margin-top: 15px; }
.season-intro-spacing-compact .season-preview-skip { margin-top: 6px; }
.season-intro-spacing-roomy .season-preview-hero { margin-top: 31px; }
.season-intro-spacing-roomy .season-preview-lead { margin-top: 22px; }
.season-intro-spacing-roomy .season-preview-guide { margin-top: 31px; padding-top: 14px; padding-bottom: 19px; }
.season-intro-spacing-roomy .season-preview-form { margin-top: 27px; }
.season-intro-spacing-roomy .season-preview-birth-row { margin-top: 17px; }
.season-intro-spacing-roomy .season-preview-birth-note { margin-top: 15px; }
.season-intro-spacing-roomy .season-preview-remember { margin-top: 29px; }
.season-intro-spacing-roomy .season-preview-primary { margin-top: 24px; }
.season-intro-spacing-roomy .season-preview-secondary { margin-top: 29px; }
.season-intro-spacing-roomy .season-preview-skip { margin-top: 17px; }
.season-preview-tabbar { display: grid; grid-template-columns: repeat(3, 1fr); align-items: center; height: 58px; border-top: 1px solid #ded3c5; background: #fffdf9; color: #8b7d71; font-size: 10px; text-align: center; }
.season-preview-tabbar span { display: grid; justify-items: center; gap: 3px; }
.season-preview-tabbar .is-selected { color: #a3432e; }
.season-preview-tabbar i { position: relative; display: block; width: 17px; height: 12px; border: 1px solid currentColor; border-radius: 50%; box-sizing: border-box; }
.season-preview-tabbar .home-icon { border-radius: 2px 2px 6px 6px; }
.season-preview-tabbar .practice-icon { border-radius: 7px 7px 2px 2px; }
.season-preview-tabbar .mine-icon { width: 12px; height: 12px; }
</style>
