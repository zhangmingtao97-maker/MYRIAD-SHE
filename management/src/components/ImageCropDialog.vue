<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';

const props = withDefaults(defineProps<{
  file: File;
  title?: string;
}>(), {
  title: '裁剪图片',
});

const emit = defineEmits<{
  confirm: [file: File];
  cancel: [];
}>();

type AspectPreset = 'free' | 'square' | 'four-three' | 'three-two' | 'sixteen-nine';

const aspectPresets: Array<{ key: AspectPreset; label: string; ratio: number }> = [
  { key: 'free', label: '自由', ratio: Number.NaN },
  { key: 'square', label: '1:1', ratio: 1 },
  { key: 'four-three', label: '4:3', ratio: 4 / 3 },
  { key: 'three-two', label: '3:2', ratio: 3 / 2 },
  { key: 'sixteen-nine', label: '16:9', ratio: 16 / 9 },
];

const dialog = ref<HTMLElement | null>(null);
const image = ref<HTMLImageElement | null>(null);
const cropper = shallowRef<Cropper | null>(null);
const selectedAspect = ref<AspectPreset>('free');
const ready = ref(false);
const processing = ref(false);
const error = ref('');
const sourceUrl = URL.createObjectURL(props.file);
let previousBodyOverflow = '';
let previousFocus: HTMLElement | null = null;

function setAspect(preset: (typeof aspectPresets)[number]) {
  selectedAspect.value = preset.key;
  cropper.value?.setAspectRatio(preset.ratio);
}

function zoomBy(ratio: number) {
  if (!ready.value) return;
  cropper.value?.zoom(ratio);
}

function resetCrop() {
  if (!ready.value) return;
  selectedAspect.value = 'free';
  cropper.value?.setAspectRatio(Number.NaN);
  cropper.value?.reset();
}

function closeDialog() {
  if (processing.value) return;
  emit('cancel');
}

function focusableElements() {
  if (!dialog.value) return [];
  return Array.from(dialog.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), [href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => element.getClientRects().length > 0 && element.tabIndex >= 0);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeDialog();
    return;
  }
  if (event.key !== 'Tab' || !dialog.value) return;
  const elements = focusableElements();
  const first = elements[0];
  const last = elements[elements.length - 1];
  if (!first || !last) {
    event.preventDefault();
    dialog.value.focus();
    return;
  }
  const activeElement = document.activeElement;
  if (activeElement === dialog.value || !dialog.value.contains(activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

const MAX_IMAGE_EDGE = 1600;
const WEBP_QUALITY = 0.82;

function outputFileName(type: string) {
  const extension = type === 'image/webp' ? 'webp' : 'jpg';
  const baseName = props.file.name.replace(/\.([a-z0-9]+)$/i, '') || 'image';
  return `${baseName}-cropped.${extension}`;
}

function encodeCanvas(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

async function optimizedImageBlob(canvas: HTMLCanvasElement) {
  for (const [type, quality] of [['image/webp', WEBP_QUALITY], ['image/jpeg', WEBP_QUALITY]] as const) {
    const blob = await encodeCanvas(canvas, type, quality);
    if (blob && blob.type === type) return blob;
  }
  throw new Error('当前浏览器无法生成 WebP 或 JPEG 图片');
}

async function confirmCrop() {
  if (!ready.value || processing.value || !cropper.value) return;
  processing.value = true;
  error.value = '';
  try {
    const canvas = cropper.value.getCroppedCanvas({
      maxWidth: MAX_IMAGE_EDGE,
      maxHeight: MAX_IMAGE_EDGE,
      fillColor: '#ffffff',
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    });
    const blob = await optimizedImageBlob(canvas);
    emit('confirm', new File([blob], outputFileName(blob.type), { type: blob.type, lastModified: Date.now() }));
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '图片裁剪失败，请重试。';
  } finally {
    processing.value = false;
  }
}

onMounted(async () => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', handleKeydown);
  await nextTick();
  dialog.value?.focus();
  if (!image.value) return;
  try {
    cropper.value = new Cropper(image.value, {
      viewMode: 1,
      dragMode: 'crop',
      autoCrop: true,
      autoCropArea: 0.9,
      background: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      movable: true,
      zoomable: true,
      zoomOnWheel: true,
      responsive: true,
      checkOrientation: true,
      modal: true,
      guides: true,
      minCropBoxWidth: 64,
      minCropBoxHeight: 64,
      ready() {
        ready.value = true;
      },
    });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '图片载入失败，请重新选择。';
  }
});

onBeforeUnmount(() => {
  cropper.value?.destroy();
  cropper.value = null;
  URL.revokeObjectURL(sourceUrl);
  document.body.style.overflow = previousBodyOverflow;
  document.removeEventListener('keydown', handleKeydown);
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
});
</script>

<template>
  <div class="image-crop-backdrop" @click.self="closeDialog">
    <section
      ref="dialog"
      class="image-crop-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-crop-title"
      aria-describedby="image-crop-description"
      data-admin-dialog-managed="local"
      tabindex="-1"
    >
      <header class="image-crop-header">
        <div>
          <p class="image-crop-kicker">图片编辑</p>
          <h3 id="image-crop-title">{{ title }}</h3>
          <p id="image-crop-description">拖动图片调整位置，拖动选框边角选择要保留的画面。</p>
        </div>
        <button type="button" class="image-crop-close" aria-label="关闭图片裁剪" title="取消裁剪" :disabled="processing" @click="closeDialog">×</button>
      </header>

      <div class="image-crop-toolbar">
        <div class="image-crop-ratio-group" aria-label="裁剪比例">
          <span>比例</span>
          <button
            v-for="preset in aspectPresets"
            :key="preset.key"
            type="button"
            class="image-crop-ratio-button"
            :class="{ active: selectedAspect === preset.key }"
            :aria-pressed="selectedAspect === preset.key"
            @click="setAspect(preset)"
          >{{ preset.label }}</button>
        </div>
        <div class="image-crop-zoom-group" aria-label="图片缩放">
          <button type="button" class="image-crop-tool-button" aria-label="缩小图片" title="缩小" :disabled="!ready" @click="zoomBy(-0.1)">−</button>
          <button type="button" class="image-crop-tool-button" aria-label="放大图片" title="放大" :disabled="!ready" @click="zoomBy(0.1)">＋</button>
          <button type="button" class="image-crop-tool-button image-crop-reset" :disabled="!ready" @click="resetCrop">重置</button>
        </div>
      </div>

      <div class="image-crop-stage">
        <img ref="image" :src="sourceUrl" :alt="`待裁剪图片：${file.name}`" @error="error = '图片无法载入，请换一张图片重试。'" />
        <p v-if="!ready && !error" class="image-crop-loading" role="status">正在载入图片…</p>
      </div>

      <p class="image-crop-tip">滚轮可以缩放图片。确认后会按当前选框生成并上传新图片，不会修改原文件。</p>
      <p v-if="error" class="image-crop-error" role="alert">{{ error }}</p>

      <footer class="image-crop-actions">
        <button type="button" class="image-crop-cancel" :disabled="processing" @click="closeDialog">取消</button>
        <button type="button" class="image-crop-confirm" :disabled="!ready || processing" @click="confirmCrop">{{ processing ? '正在生成…' : '确认裁剪并上传' }}</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.image-crop-backdrop {
  position: fixed;
  inset: 0;
  z-index: 6000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(18, 18, 20, .74);
  backdrop-filter: blur(7px);
}

.image-crop-dialog {
  display: flex;
  flex-direction: column;
  width: min(960px, 100%);
  max-height: calc(100vh - 48px);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, .14);
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 28px 80px rgba(0, 0, 0, .34);
  outline: none;
}

.image-crop-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 22px 16px;
  border-bottom: 1px solid #e7e7e2;
}

.image-crop-kicker {
  margin: 0 0 3px;
  color: #8a4130;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
}

.image-crop-header h3 {
  margin: 0;
  color: #17181a;
  font-size: 20px;
  line-height: 1.35;
}

.image-crop-header p:last-child {
  margin: 6px 0 0;
  color: #6f7378;
  font-size: 13px;
  line-height: 1.55;
}

.image-crop-close {
  flex: 0 0 36px;
  width: 36px;
  min-width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid #deded8;
  border-radius: 8px;
  background: #ffffff;
  color: #3f4247;
  font-size: 23px;
  line-height: 34px;
}

.image-crop-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 18px;
  padding: 12px 22px;
  border-bottom: 1px solid #ecece7;
  background: #fafaf8;
}

.image-crop-ratio-group,
.image-crop-zoom-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.image-crop-ratio-group > span {
  margin-right: 3px;
  color: #6f7378;
  font-size: 12px;
  font-weight: 600;
}

.image-crop-ratio-button,
.image-crop-tool-button {
  min-height: 32px;
  padding: 4px 10px;
  border: 1px solid #dcdcd6;
  border-radius: 7px;
  background: #ffffff;
  color: #3f4247;
  font-size: 12.5px;
}

.image-crop-ratio-button.active {
  border-color: #8a4130;
  background: #f7ede9;
  color: #6d3122;
  font-weight: 700;
}

.image-crop-tool-button {
  min-width: 36px;
  font-size: 15px;
}

.image-crop-reset {
  font-size: 12.5px;
}

.image-crop-stage {
  position: relative;
  flex: 1 1 auto;
  height: clamp(300px, calc(100vh - 340px), 560px);
  min-height: 280px;
  margin: 18px 22px 0;
  overflow: hidden;
  border-radius: 8px;
  background:
    linear-gradient(45deg, rgba(255, 255, 255, .045) 25%, transparent 25%, transparent 75%, rgba(255, 255, 255, .045) 75%),
    linear-gradient(45deg, rgba(255, 255, 255, .045) 25%, transparent 25%, transparent 75%, rgba(255, 255, 255, .045) 75%),
    #25272a;
  background-position: 0 0, 8px 8px;
  background-size: 16px 16px;
}

.image-crop-stage img {
  display: block;
  max-width: 100%;
}

.image-crop-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  color: rgba(255, 255, 255, .78);
  font-size: 13px;
}

.image-crop-tip,
.image-crop-error {
  margin: 10px 22px 0;
  font-size: 12.5px;
  line-height: 1.55;
}

.image-crop-tip {
  color: #6f7378;
}

.image-crop-error {
  color: #a1372a;
}

.image-crop-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 22px 20px;
}

.image-crop-cancel,
.image-crop-confirm {
  min-height: 40px;
  padding: 8px 18px;
  border-radius: 8px;
  font-weight: 600;
}

.image-crop-cancel {
  border: 1px solid #d7d7d0;
  background: #ffffff;
  color: #3f4247;
}

.image-crop-confirm {
  min-width: 156px;
  border: 1px solid #6d3122;
  background: #8a4130;
  color: #ffffff;
}

.image-crop-confirm:not(:disabled):hover {
  background: #6d3122;
}

@media (max-width: 720px) {
  .image-crop-backdrop {
    padding: 10px;
  }

  .image-crop-dialog {
    max-height: calc(100vh - 20px);
  }

  .image-crop-header {
    padding: 16px;
  }

  .image-crop-header h3 {
    font-size: 17px;
  }

  .image-crop-toolbar {
    padding: 10px 16px;
  }

  .image-crop-stage {
    height: calc(100vh - 330px);
    min-height: 230px;
    margin: 12px 16px 0;
  }

  .image-crop-tip,
  .image-crop-error {
    margin-right: 16px;
    margin-left: 16px;
  }

  .image-crop-actions {
    padding: 12px 16px 16px;
  }

  .image-crop-actions button {
    flex: 1 1 140px;
  }
}
</style>
