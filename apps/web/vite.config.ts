import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendOrigin = process.env.BACKEND_ORIGIN ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    watch: {
      // 编辑器/工具用「临时目录 + rename」原子写文件时，chokidar 会去 watch 那个刚被改名的临时文件，
      // Windows 上直接抛 EBUSY 把整个 dev server 干掉。这里排除掉，别让它崩。
      ignored: ['**/*.tmpdir/**', '**/.*.tmp'],
    },
    proxy: {
      '/api': {
        target: backendOrigin,
        changeOrigin: true,
      },
    },
  },
});
