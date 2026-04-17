// OneSignal Web Push init - lightweight loader
let initialized = false;

export function initOneSignal(appId: string | undefined) {
  if (initialized || !appId) return;
  if (typeof window === 'undefined') return;
  // Skip in iframe / preview
  try {
    if (window.self !== window.top) return;
  } catch { return; }
  if (window.location.hostname.includes('lovable')) return;

  initialized = true;
  const script = document.createElement('script');
  script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
  script.defer = true;
  document.head.appendChild(script);

  (window as any).OneSignalDeferred = (window as any).OneSignalDeferred || [];
  (window as any).OneSignalDeferred.push(async function (OneSignal: any) {
    await OneSignal.init({
      appId,
      allowLocalhostAsSecureOrigin: true,
      notifyButton: { enable: false },
    });
  });
}

export async function setOneSignalUser(userId: string) {
  try {
    (window as any).OneSignalDeferred = (window as any).OneSignalDeferred || [];
    (window as any).OneSignalDeferred.push(async function (OneSignal: any) {
      await OneSignal.login(userId);
    });
  } catch {}
}
