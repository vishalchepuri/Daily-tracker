import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "site.dayza.app",
  appName: "Dayza",
  webDir: "ios-web",
  server: {
    url: process.env.CAPACITOR_SERVER_URL || "https://dayza.site",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
  },
};

export default config;
