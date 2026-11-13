import { createApp } from 'vue';
import App from './App.vue';
import garamondFont from '../../miniprogram/fonts/AppleGaramond.woff2?url';
import sourceHanSerifFont from '../../miniprogram/fonts/SourceHanSerifCN-Regular.woff2?url';
import loginSongFont from './assets/SourceHanSerifCN-Login.woff2?url';
import { loginSongUnicodeRange } from './assets/login-font-range';
import './style.css';
// 设计系统 v3：在 legacy 组件样式之后加载，覆盖旧主题。
import './admin-theme.css';
import './admin-fixes.css';
import './admin-journal.css';
import './admin-preview.css';
import './admin-dashboard.css';
import './admin-experience.css';
import './admin-state-machine.css';
import './admin-tabs.css';
import './admin-motion.css';
import './admin-brand.css';

const brandFonts = document.createElement('style');
brandFonts.textContent = `
  @font-face {
    font-family: "MYRIAD Garamond";
    src: url("${garamondFont}") format("woff2");
    font-style: normal;
    font-weight: 400;
    font-display: swap;
  }
  @font-face {
    font-family: "MYRIAD Song";
    src: url("${sourceHanSerifFont}") format("woff2");
    font-style: normal;
    font-weight: 400;
    font-display: swap;
  }
  /* The later, restricted face covers login copy; other text uses the full face. */
  @font-face {
    font-family: "MYRIAD Song";
    src: url("${loginSongFont}") format("woff2");
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    unicode-range: ${loginSongUnicodeRange};
  }
`;
document.head.append(brandFonts);

createApp(App).mount('#app');
