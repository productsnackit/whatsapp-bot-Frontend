// Phone / desktop notifications for Internal Chat, delivered by the service worker (public/sw.js).

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isInstalled = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

// "on" | "off" | "denied" | "needs-install" (iPhone Safari tab) | "unsupported"
export async function getPushState() {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return isIOS() && !isInstalled() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  const registration = await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription()) ? "on" : "off";
}

function urlBase64ToUint8Array(base64) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

// Must be called from a tap (iPhone only allows the permission prompt then).
export async function enablePush(api, headers) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const { data } = await api.get("/internal/push/public-key", { headers });
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey),
    });
  }
  await api.post("/internal/push/subscribe", { subscription: subscription.toJSON() }, { headers });
  return "on";
}

// After login: link this device's existing subscription to whoever is signed in now.
export async function syncPush(api, headers) {
  if ((await getPushState()) !== "on") return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  await api.post("/internal/push/subscribe", { subscription: subscription.toJSON() }, { headers });
}

// On logout: stop sending this person's messages to this device.
export async function disablePush(api, headers) {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  await api.post("/internal/push/unsubscribe", { endpoint: subscription.endpoint }, { headers }).catch(() => null);
  await subscription.unsubscribe().catch(() => null);
}
