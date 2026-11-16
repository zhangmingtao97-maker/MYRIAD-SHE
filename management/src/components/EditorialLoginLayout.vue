<script setup lang="ts">
defineProps<{ wecomOpen: boolean }>();
const year = new Date().getFullYear();
</script>

<template>
  <div class="editorial-login" :class="{ 'is-wecom': wecomOpen }">
    <header class="editorial-login-masthead">
      <div class="editorial-login-wordmark">MYRIAD SHE<span>内容编辑工作台</span></div>
      <span class="editorial-login-topnote">A QUIET SPACE FOR GOOD STORIES</span>
    </header>
    <div class="editorial-login-columns">
      <section class="editorial-login-identity" aria-label="品牌寄语">
        <p class="editorial-login-kicker">THOUGHTFULLY TOLD. GENTLY SHARED.</p>
        <div class="editorial-login-monogram" aria-hidden="true">MS</div>
        <p class="editorial-login-statement">让好的内容，<br />被慢慢看见。</p>
        <p class="editorial-login-signature">温柔地观察，自由地表达。</p>
      </section>
      <section class="editorial-login-panel" aria-labelledby="login-brand">
        <p class="editorial-login-kicker">EDITORIAL ACCESS</p>
        <h1 id="login-brand">{{ wecomOpen ? '扫码登录' : '欢迎回来' }}</h1>
        <p class="editorial-login-intro">登录 MYRIAD SHE 内容管理后台</p>
        <slot />
        <p class="editorial-login-helper"><svg viewBox="0 0 12 14" aria-hidden="true"><rect x="2" y="6" width="8" height="7" rx="1" /><path d="M4 6V4a2 2 0 0 1 4 0v2" /></svg>仅限授权编辑与管理员访问</p>
      </section>
    </div>
    <footer class="editorial-login-footer"><span>© {{ year }} MYRIAD SHE</span><span>CREATED WITH CARE</span><span>万千种她，万千种生活。</span></footer>
  </div>
</template>

<style>
.app-frame.login-frame { background: #f5f0e8; color: #57372e; }
.login-frame .shell.login-shell { display: block; flex: 1; width: 100%; max-width: none; margin: 0; padding: 0; }
.login-frame .filing-footer { padding: 0 20px max(14px, env(safe-area-inset-bottom)); background: #f5f0e8; color: #806b59; font-size: 11px; }
</style>
<style scoped>
.editorial-login { width: 100%; --login-ink: #57372e; --login-muted: #806b59; --login-line: #d9cfc1; min-height: calc(100svh - 32px); padding: 0 clamp(28px, 5.4vw, 88px); position: relative; isolation: isolate; overflow: hidden; color: var(--login-ink); background: #f5f0e8; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }
.editorial-login::before { content: ''; position: absolute; z-index: -1; width: 1000px; height: 1000px; border-radius: 50%; left: -515px; bottom: -750px; background: linear-gradient(135deg, #e6dacb66, #faf6f100); box-shadow: 1px -1px 0 #fcfaf533; pointer-events: none; }
.editorial-login::after { content: ''; position: absolute; z-index: -1; width: 1450px; height: 1100px; border-radius: 50%; left: -470px; bottom: -990px; border: 1px solid #dcd0bf55; transform: rotate(-18deg); pointer-events: none; }
.editorial-login-masthead { min-height: 124px; display: flex; justify-content: space-between; align-items: center; gap: 24px; border-bottom: 1px solid var(--login-line); }
.editorial-login-wordmark { font: 31px/1.1 "MYRIAD Garamond", Georgia, serif; letter-spacing: 3px; }
.editorial-login-wordmark span { display: block; font: 10px/1.5 "PingFang SC", "Microsoft YaHei", sans-serif; letter-spacing: 3.7px; margin-top: 12px; }
.editorial-login-topnote { display: flex; align-items: center; gap: 18px; font: 11px "MYRIAD Garamond", Georgia, serif; letter-spacing: 2.1px; color: var(--login-muted); }
.editorial-login-topnote::before { content: ''; width: 28px; height: 1px; background: #cbbbaa; }
.editorial-login-columns { width: min(1050px, 100%); min-height: max(660px, calc(100svh - 235px)); margin: auto; padding: 64px 0; display: grid; grid-template-columns: minmax(0, 590fr) minmax(0, 460fr); align-items: center; }
.editorial-login-identity { min-height: 520px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; border-right: 1px solid var(--login-line); padding: 0 36px 12px 0; }
.editorial-login-kicker { margin: 0; font: 10px/1.7 "MYRIAD Garamond", Georgia, serif; letter-spacing: 2.7px; color: var(--login-muted); }
.editorial-login-monogram { font: 248px/.93 "MYRIAD Garamond", Georgia, serif; letter-spacing: -10px; margin: 32px 0 0 -9px; }
.editorial-login-statement { font: 37px/1.8 "MYRIAD Song", "Songti SC", SimSun, serif; letter-spacing: 3.5px; margin: 31px 0 0; }
.editorial-login-signature { display: flex; align-items: center; gap: 15px; margin: 29px 0 0; color: var(--login-muted); font-size: 11px; line-height: 1.8; letter-spacing: 2px; }
.editorial-login-signature::before { content: ''; flex: 0 0 32px; height: 1px; background: #baaa96; }
.editorial-login-panel { width: 100%; padding-left: clamp(40px, 6.25vw, 90px); }
.editorial-login-panel > .editorial-login-kicker { font-size: 10px; letter-spacing: 2.5px; }
.editorial-login-panel h1 { font: 32px/1.6 "MYRIAD Song", "Songti SC", SimSun, serif; font-weight: 400; margin: 13px 0 12px; letter-spacing: 3px; color: var(--login-ink); }
.editorial-login-intro { font-size: 12px; line-height: 1.8; color: var(--login-muted); letter-spacing: .5px; margin: 0 0 34px; }
.editorial-login-panel :deep(form) { display: grid; gap: 22px; margin: 0; }
.editorial-login-panel :deep(label) { display: grid; gap: 10px; font-size: 12px; line-height: 1.6; letter-spacing: 2px; color: var(--login-ink); }
.editorial-login-panel :deep(input) { display: block; width: 100%; min-width: 0; height: 48px; min-height: 48px; border: 1px solid #c4b49f; border-radius: 10px; padding: 0 15px; background: #f8f4ec44; color: var(--login-ink); font: 14px "PingFang SC", "Microsoft YaHei", sans-serif; letter-spacing: .5px; box-shadow: none; }
.editorial-login-panel :deep(input::placeholder) { color: #8c7864; font-size: 12px; opacity: 1; }
.editorial-login-panel :deep(input:focus) { border-color: #80614f; outline: 2px solid #80614f22; outline-offset: 2px; background: #faf6ee; }
.editorial-login-panel :deep(.editorial-password-field) { position: relative; display: block; }
.editorial-login-panel :deep(.editorial-password-field input) { padding-right: 50px; }
.editorial-login-panel :deep(button) { font-family: inherit; }
.editorial-login-panel :deep(.editorial-password-toggle) { position: absolute; inset: 2px 2px 2px auto; display: grid; place-items: center; width: 44px; height: 44px; min-height: 44px; padding: 12px; background: transparent; color: #806b59; border: 0; border-radius: 8px; box-shadow: none; transform: none; }
.editorial-login-panel :deep(.editorial-password-toggle svg) { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.1; }
.editorial-login-panel :deep(button[type="submit"]) { position: relative; display: flex; align-items: center; justify-content: center; height: 48px; min-height: 48px; width: 100%; margin-top: 7px; padding: 12px 45px; border: 1px solid var(--login-ink); border-radius: 14px; background: var(--login-ink); color: #f5f0e8; font: 14px/1.5 "MYRIAD Song", serif; font-weight: 400; letter-spacing: 5px; box-shadow: none; transform: none; }
.editorial-login-panel :deep(.editorial-submit-arrow) { position: absolute; right: 18px; font: 22px/1 "MYRIAD Garamond", Georgia, serif; letter-spacing: 0; color: #ddc9b4; }
.editorial-login-panel :deep(button[type="submit"]:not(:disabled):hover) { background: #68463b; border-color: #68463b; box-shadow: 0 4px 14px #57372e0c; }
.editorial-login-panel :deep(button:disabled) { opacity: .6; cursor: wait; }
.editorial-login-panel :deep(.login-divider) { display: flex; align-items: center; gap: 15px; color: var(--login-muted); font-size: 10px; margin: 22px 0; }
.editorial-login-panel :deep(.login-divider::before), .editorial-login-panel :deep(.login-divider::after) { content: ''; height: 1px; flex: 1; background: var(--login-line); }
.editorial-login-panel :deep(.wecom-login-button) { display: flex; justify-content: center; align-items: center; gap: 10px; width: 100%; min-height: 46px; padding: 10px 15px; border: 1px solid #c4b49f; border-radius: 14px; background: transparent; color: var(--login-ink); font-size: 12px; font-weight: 400; line-height: 1.8; letter-spacing: 1px; box-shadow: none; transform: none; }
.editorial-login-panel :deep(.wecom-login-button:not(:disabled):hover) { background: #ece3d666; border-color: #a89079; }
.editorial-login-panel :deep(.editorial-wecom-icon) { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.1; }
.editorial-login-helper { font-size: 10px; line-height: 1.8; letter-spacing: .7px; color: var(--login-muted); text-align: center; margin: 20px 0 0; }
.editorial-login-helper svg { width: 10px; height: 11px; fill: none; stroke: currentColor; stroke-width: 1; vertical-align: -1px; margin-right: 6px; }
.editorial-login-footer { min-height: 79px; border-top: 1px solid var(--login-line); display: flex; justify-content: space-between; align-items: center; gap: 20px; color: var(--login-muted); font-size: 10px; letter-spacing: 1.5px; }
.editorial-login-footer > span:not(:last-child) { font-family: "MYRIAD Garamond", Georgia, serif; }
.editorial-login-footer > span:nth-child(2) { font-size: 9px; letter-spacing: 2px; }
.editorial-login-panel :deep(.wecom-qr-frame) { width: 100%; padding: 14px 0 8px; min-height: 420px; border: 1px solid var(--login-line); border-radius: 14px; box-shadow: none; }
.editorial-login-panel :deep(.wecom-back) { border: 1px solid #c4b49f; border-radius: 14px; min-height: 44px; padding: 10px 20px; color: var(--login-ink); }
.editorial-login-panel :deep(.login-error) { color: #9a382d; overflow-wrap: anywhere; }
.editorial-login-panel :deep(button:focus-visible) { outline: 2px solid #80614f; outline-offset: 4px; }
@media(max-width:1000px) { .editorial-login-columns { grid-template-columns: 1fr 1fr; } .editorial-login-identity { min-height: 500px; } .editorial-login-monogram { font-size: 210px; } .editorial-login-statement { font-size: 30px; } .editorial-login-topnote { font-size: 9px; letter-spacing: 1.4px; } .editorial-login-kicker { font-size: 9px; letter-spacing: 1.7px; } .editorial-login-panel { padding-left: 36px; } }
@media(max-width:700px) { .editorial-login { padding: 0 24px; } .editorial-login-masthead { min-height: 96px; } .editorial-login-wordmark { font-size: 27px; } .editorial-login-wordmark span { font-size: 9px; margin-top: 10px; } .editorial-login-topnote { display: none; } .editorial-login-columns { display: block; min-height: auto; padding: 36px 0 44px; max-width: 400px; } .editorial-login-identity { min-height: 0; display: grid; grid-template-columns: auto 1fr; align-items: center; column-gap: 24px; border: 0; padding: 0 0 28px; margin-bottom: 30px; border-bottom: 1px solid var(--login-line); } .editorial-login-identity .editorial-login-kicker, .editorial-login-signature { display: none; } .editorial-login-monogram { font-size: 88px; margin: 0; letter-spacing: -4px; } .editorial-login-statement { font-size: 21px; line-height: 1.9; letter-spacing: 2px; margin: 0; } .editorial-login-panel { padding: 0; } .editorial-login-panel h1 { font-size: 28px; margin: 10px 0; } .editorial-login-intro { margin-bottom: 28px; font-size: 11px; } .editorial-login-panel :deep(input) { font-size: 16px; } .editorial-login-footer { min-height: 76px; font-size: 9px; letter-spacing: .8px; flex-wrap: wrap; gap: 12px; padding: 20px 0; } .editorial-login-footer > span:nth-child(2) { display: none; } .editorial-login-footer > span:last-child { font-size: 9px; } }
@media(prefers-reduced-motion:reduce) { .editorial-login :deep(*) { animation: none !important; transition: none !important; } }
</style>
