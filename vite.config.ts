import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5273,
    open: false,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          pixi: ['pixi.js', 'pixi-filters'],
          anim: ['gsap'],
        },
      },
    },
  },
  // I nostri shader sono stringhe TS, ma teniamo il loader per .frag/.vert
  assetsInclude: ['**/*.frag', '**/*.vert'],
});
