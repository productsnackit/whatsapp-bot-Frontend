// Minimal service worker so the dashboard can be installed as an app.
// It does not cache anything: every request goes to the network, so users always get the latest version.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request));
  }
});

// Internal chat notifications sent by the backend (see pushNotifications.js there).
self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Snackit Chat", {
      body: data.body || "New message",
      icon: "/app-icon-192.png?v=2",
      badge: "/app-icon-192.png?v=2",
      tag: data.chatId ? `chat-${data.chatId}` : undefined,
      renotify: true,
      data: { chatId: data.chatId || "", department: data.department || "" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { chatId, department } = event.notification.data || {};
  const params = new URLSearchParams({ view: "internal-chat" });
  if (chatId) params.set("chat", chatId);
  if (department) params.set("department", department);
  const url = `/?${params}`;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows[0];
    if (open) {
      open.postMessage({ type: "open-internal-chat", chatId, department });
      return open.focus();
    }
    return self.clients.openWindow(url);
  })());
});
