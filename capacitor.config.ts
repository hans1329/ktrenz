import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ktrenz.app',
  appName: 'KTrenZ',
  webDir: 'dist',
  server: {
    url: 'https://ktrenz.com',
    cleartext: true,
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'KTrenZ',
  },
};

export default config;
