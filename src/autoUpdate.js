// Keeps phones (and the home-screen app) on the latest dashboard with fresh data.
//   • Phones: coming back to the app after 30 seconds or more away always reloads it.
//   • Every 2 minutes (and on coming back) the live index.html is compared with the running
//     script; a new version reloads straight away, unless someone is typing in a box, then a
//     small "tap to update" bar shows instead so nothing typed is lost.
const SCRIPT = /\/assets\/index-[\w-]+\.js/;
const running = () => SCRIPT.exec([...document.scripts].map((script) => script.src).join(" "))?.[0] || null;
const isPhone = () => window.matchMedia("(max-width: 900px)").matches || window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const typing = () => {
  const element = document.activeElement;
  return Boolean(element && (["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) || element.isContentEditable));
};

let shown = false;
function showBar() {
  if (shown) return;
  shown = true;
  const bar = document.createElement("button");
  bar.type = "button";
  bar.textContent = "✨ A new version is ready · Tap to update";
  bar.setAttribute("style", "position:fixed;left:50%;top:calc(10px + env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483647;padding:11px 18px;border:0;border-radius:999px;background:#070a10;color:#fff;font:700 14px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.35);cursor:pointer;max-width:calc(100% - 24px)");
  bar.onclick = () => window.location.reload();
  document.body.appendChild(bar);
}

export function startAutoUpdate() {
  const current = running();
  if (!current || import.meta.env.DEV) return; // only in the built app
  let checking = false;
  const check = async () => {
    if (checking || !navigator.onLine) return;
    checking = true;
    try {
      const response = await fetch(`/?v=${Date.now()}`, { cache: "no-store" });
      const live = SCRIPT.exec(await response.text())?.[0];
      if (live && live !== current) {
        if (typing()) showBar();
        else window.location.reload();
      }
    } catch { /* offline: try again later */ } finally {
      checking = false;
    }
  };
  let hiddenAt = 0;
  const comeBack = () => {
    const away = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    if (isPhone() && away > 30000) window.location.reload(); // always fresh on phones
    else check();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else comeBack();
  });
  window.addEventListener("pageshow", (event) => { if (event.persisted) window.location.reload(); }); // restored from the back/forward cache
  setInterval(() => { if (document.visibilityState === "visible") check(); }, 2 * 60000);
  setTimeout(check, 10000);
}
