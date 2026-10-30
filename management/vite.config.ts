import { dirname, resolve } from 'node:path';
import { env } from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const configDirectory = dirname(fileURLToPath(import.meta.url));
const fontDirectory = resolve(configDirectory, '..', 'miniprogram');

export default defineConfig({
  plugins: [vue()],
  server: {
    // 开发环境禁用浏览器缓存：改样式后刷新即可看到最新结果，避免旧模块/旧 CSS 干扰排查
    headers: { 'Cache-Control': 'no-store' },
    proxy: env.VITE_API_PROXY_TARGET ? {
      '/__api': {
        target: env.VITE_API_PROXY_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__api/, '/api'),
        configure(proxy) {
          proxy.on('proxyReq', (request) => request.removeHeader('origin'));
        },
      },
    } : undefined,
    fs: {
      allow: [configDirectory, fontDirectory],
    },
  },
});
