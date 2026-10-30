import { createApp } from 'vue';
import App from './App.vue';
import garamondFont from '../../miniprogram/AppleGaramond.ttf?url';
import sourceHanSerifFont from '../../miniprogram/SourceHanSerifCN-Regular.otf?url';
import './style.css';
// 设计系统 v3：在 legacy 组件样式之后加载，覆盖旧主题。
import './admin-theme.css';
import './admin-fixes.css';
import './admin-journal.css';

const brandFonts = document.createElement('style');
brandFonts.textContent = `
  @font-face {
    font-family: Garamond;
    src: url("${garamondFont}") format("truetype");
    font-style: normal;
    font-weight: 400;
    font-display: swap;
  }
  @font-face {
    font-family: "Source Han Serif CN";
    src: url("${sourceHanSerifFont}") format("opentype");
    font-style: normal;
    font-weight: 400;
    font-display: swap;
  }
`;
document.head.append(brandFonts);

createApp(App).mount('#app');
