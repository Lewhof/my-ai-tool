import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.za.lewhofmeyr.app',
  appName: 'Lewhof AI',
  webDir: 'out',
  server: {
    // In production: load from the live URL (hybrid mode)
    // This means the app requires internet but avoids static export limitations
    url: 'https://lewhofmeyr.co.za',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#2E2318',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#2E2318',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#2E2318',
  },
  ios: {
    backgroundColor: '#2E2318',
    contentInset: 'always',
    preferredContentMode: 'mobile',
    scheme: 'Lewhof AI',
  },
};

export default config;
