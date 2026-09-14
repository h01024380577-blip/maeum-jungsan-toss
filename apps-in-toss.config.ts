import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'maeum-jungsan',

  brand: {
    primaryColor: '#3B82F6',
  },

  webView: {},

  permissions: [
    { name: 'clipboard', access: 'read' },
    { name: 'clipboard', access: 'write' },
    { name: 'photos', access: 'read' },
    { name: 'camera', access: 'access' },
    { name: 'contacts', access: 'read' },
  ],

  // SDK 3.x 의 `ait build` 는 이 디렉터리를 "있는 그대로" 아티팩트에 담고,
  // 루트에 index.html 이 있어야 한다(2.x 는 `<outdir>/web` 을 찾아 들어갔다).
  // next.config.ts 가 CSR 빌드에서 distDir 을 dist/web 으로 잡으므로 여기도 dist/web.
  webBundleDir: 'dist/web',
});
