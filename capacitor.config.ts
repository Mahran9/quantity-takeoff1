// Plain config object (no @capacitor/cli type import, so `npm run lint` works without Android tooling).
// TODO before publishing the APK: replace appId with your own reverse-domain id, e.g. com.yourname.qto
const config = {
  appId: "app.quantitytakeoff.mobile",
  appName: "حصر الكميات - Quantity Takeoff",
  webDir: "dist",
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
