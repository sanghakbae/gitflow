import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 매니페스트는 public/manifest.webmanifest 를 그대로 쓴다.
      // 플러그인이 또 만들면 index.html 에 link 가 둘이 되어 서로 다른 걸 가리킨다.
      manifest: false,
      // 'prompt' — 새 버전이 받아져도 사용자가 누를 때까지 갈아치우지 않는다.
      // autoUpdate 로 두면 작성 중이던 입력이 새로고침에 날아간다.
      registerType: 'prompt',
      injectRegister: null, // 등록은 src/pwa.js 에서 직접 한다 (안내 UI 를 붙여야 하므로)
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // 오프라인에서도 SPA 경로(/repo/:id 등)가 열리게 한다.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          // 로컬 모드 탐지는 실제 서버에 물어야 한다. 캐시가 답하면
          // 로컬 API 가 없는데도 있는 것처럼 오인한다.
          /^\/api\//,
          // 확장자가 있는 요청은 파일이지 화면이 아니다.
          /\/[^/?]+\.[^/]+$/,
        ],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // 개발 중에는 서비스워커를 끈다. 로컬 모드에서 /api 프록시와
        // 캐시가 섞이면 디버깅이 어려워진다.
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5177,
    proxy: {
      '/api': 'http://localhost:5178',
    },
  },
})
