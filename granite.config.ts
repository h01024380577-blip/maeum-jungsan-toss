import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'maeum-jungsan',
  brand: {
    displayName: '마음정산',
    primaryColor: '#3B82F6',
    icon: 'https://maeum-jungsan.duckdns.org/icon.png',
  },
  web: {
    host: 'localhost',
    port: 3000,
    commands: {
      dev: 'next dev',
      build: 'npm run build:ait',
    },
  },
  webViewProps: {
    type: 'partner',
  },
  permissions: [
    { name: 'clipboard', access: 'read' },
    { name: 'clipboard', access: 'write' },
    { name: 'photos', access: 'read' },
    { name: 'camera', access: 'access' },
    { name: 'contacts', access: 'read' },
  ] as any,
});
