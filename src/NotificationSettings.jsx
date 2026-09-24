// Notifications panel opened from the menu. Always reachable, so someone who tapped
// "Don't Allow" by mistake can see how to turn notifications back on.
import { PUSH_STATE_LABELS } from "./pushNotifications.js";

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isAndroid = () => /Android/i.test(navigator.userAgent);


function BlockedSteps() {
  if (isIOS()) {
    return (
      <ol>
        <li>Open the iPhone <b>Settings</b> app.</li>
        <li>Tap <b>Notifications</b>, then <b>Snackit Chat</b>.</li>
        <li>Turn on <b>Allow Notifications</b> and <b>Sounds</b>.</li>
        <li>Come back here and tap <b>I've allowed it</b>.</li>
      </ol>
    );
  }
  if (isAndroid()) {
    return (
      <ol>
        <li>Press and hold the <b>Snackit Chat</b> icon, then tap <b>App info</b> (ⓘ).</li>
        <li>Tap <b>Notifications</b> and turn them on, with sound.</li>
        <li>Come back here and tap <b>I've allowed it</b>.</li>
      </ol>
    );
  }
  return (
    <ol>
      <li>Click the icon to the left of the web address (🔒 or ⚙︎).</li>
      <li>Set <b>Notifications</b> to <b>Allow</b>.</li>
      <li>Tap <b>I've allowed it</b> below.</li>
    </ol>
  );
}

export default function NotificationSettings({ state, busy, onTurnOn, onCheckAgain, onTest, soundOn, onToggleSound, onClose }) {
  return (
    <div className="notify-settings-backdrop" onClick={onClose}>
      <div className="notify-settings" role="dialog" aria-modal="true" aria-label="Notifications" onClick={(event) => event.stopPropagation()}>
        <div className="notify-settings-head">
          <h3>🔔 Notifications</h3>
          <button type="button" className="notify-settings-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className={`notify-settings-status notify-status-${state}`}>
          Status: <b>{PUSH_STATE_LABELS[state] || "Off"}</b>
        </div>

        {state === "on" && (
          <>
            <p>You'll get a pop-up with sound for new Internal Chat messages, even when the app is closed.</p>
            <button type="button" className="notify-settings-primary" onClick={onTest} disabled={busy}>{busy ? "Sending…" : "Send me a test notification"}</button>
            <p className="notify-settings-hint">
              No sound? {isIOS() ? "In iPhone Settings → Notifications → Snackit Chat, turn on Sounds, and make sure the phone isn't on silent or in a Focus mode."
                : "Check the phone isn't on silent, and that Snackit Chat notifications are allowed to make sound."}
            </p>
          </>
        )}

        {state === "off" && (
          <>
            <p>Get a pop-up with sound when someone messages you, like WhatsApp.</p>
            <button type="button" className="notify-settings-primary" onClick={onTurnOn} disabled={busy}>{busy ? "Turning on…" : "Turn on notifications"}</button>
            <p className="notify-settings-hint">When your phone asks, tap <b>Allow</b>.</p>
          </>
        )}

        {state === "denied" && (
          <>
            <p>Notifications were blocked (probably "Don't Allow" was tapped). The phone won't ask again, so turn them on in settings:</p>
            <BlockedSteps />
            <button type="button" className="notify-settings-primary" onClick={onCheckAgain} disabled={busy}>{busy ? "Checking…" : "I've allowed it"}</button>
            {isIOS() && <p className="notify-settings-hint">Can't find Snackit Chat there? Delete the app from your home screen, add it again from Safari (Share → Add to Home Screen), open it and tap Turn on notifications.</p>}
          </>
        )}

        {state === "needs-install" && (
          <>
            <p>On iPhone, notifications only work in the installed app:</p>
            <ol>
              <li>In Safari, tap <b>Share</b> → <b>Add to Home Screen</b>.</li>
              <li>Open <b>Snackit Chat</b> from your home screen.</li>
              <li>Open this menu again and tap <b>Turn on notifications</b>.</li>
            </ol>
          </>
        )}

        {state === "unsupported" && <p>This browser can't show notifications. Use Chrome, Edge or Safari, or install the app on your phone.</p>}

        <label className="notify-settings-toggle">
          <input type="checkbox" checked={soundOn} onChange={(event) => onToggleSound(event.target.checked)} />
          <span><b>Sound while the app is open</b><small>Plays a tone for new messages while you're using Snackit Chat</small></span>
        </label>
      </div>
    </div>
  );
}
