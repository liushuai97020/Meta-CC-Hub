import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Electron 兼容：移除 crossorigin 属性，避免 file:// 协议下 CORS 检查失败
    {
      name: 'remove-crossorigin',
      transformIndexHtml(html) {
        return html.replace(/crossorigin(?:="[^"]*")?/g, '');
      },
    },
  ],
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer/src'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    sourcemap: true,
    // Electron 兼容：禁用 modulePreload 避免 crossorigin 引入额外 link 标签
    modulePreload: false,
    // 匹配 Electron 39 内置 Chromium 132
    target: 'chrome132',
    // Monaco Editor worker 文件本身很大（语言服务器），无法再拆分
    chunkSizeWarningLimit: 8000,
    // 禁用 Rolldown 插件耗时警告（Tailwind CSS 处理耗时正常）
    rolldownOptions: {
      checks: {
        pluginTimings: false,
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
