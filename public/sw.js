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
  event.waitUntil((async () => {
    // Like WhatsApp: no pop-up while you're looking at the app; it plays its own tone instead.
    // iPhone requires a visible notification for every push, so it always gets one.
    const isIOS = /iPad|iPhone|iPod/.test(self.navigator.userAgent);
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (!isIOS && windows.some((client) => client.focused && client.visibilityState === "visible")) return;
    await self.registration.showNotification(data.title || "Snackit Chat", {
      body: data.body || "New message",
      icon: "/app-icon-192.png?v=2",
      badge: "/app-icon-192.png?v=2",
      tag: data.ticketId ? `ticket-${data.ticketId}` : data.chatId ? `chat-${data.chatId}` : undefined,
      renotify: true,
      silent: false,
      vibrate: [200, 100, 200],
      data: { chatId: data.chatId || "", department: data.department || "", view: data.view || "", ticketId: data.ticketId || "", phone: data.phone || "" },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { chatId, department, view, ticketId, phone } = event.notification.data || {};
  // A customer replied to a ticket the admin took over: open that ticket's chat.
  if (view === "tickets" && ticketId) {
    event.waitUntil((async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows[0]) {
        windows[0].postMessage({ type: "open-ticket", ticketId, phone });
        return windows[0].focus();
      }
      return self.clients.openWindow(`/?${new URLSearchParams({ view: "tickets", ticket: ticketId, phone })}`);
    })());
    return;
  }
  // Page notifications (Internal Audit, Refill Schedule…) open that page; everything else opens the chat.
  if (view && view !== "internal-chat") {
    event.waitUntil((async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows[0]) {
        windows[0].postMessage({ type: "open-view", view });
        return windows[0].focus();
      }
      return self.clients.openWindow(`/?view=${encodeURIComponent(view)}`);
    })());
    return;
  }
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
