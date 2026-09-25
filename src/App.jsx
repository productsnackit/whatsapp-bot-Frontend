import { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import OperationsWorkspace from "./OperationsWorkspace.jsx";
import AuditWorkspace from "./AuditWorkspace.jsx";
import FindingsWorkspace from "./FindingsWorkspace.jsx";
import ExpiryWorkspace from "./ExpiryWorkspace.jsx";
import MobileChat, { Avatar } from "./MobileChat.jsx";
import { getPushState, enablePush, syncPush, disablePush, showLocalNotification, PUSH_STATE_LABELS } from "./pushNotifications.js";
import NotificationSettings from "./NotificationSettings.jsx";
import { UpiIdCell, UpiScanSummary, UpiScanDetails } from "./UpiScan.jsx";
import TicketChat from "./TicketChat.jsx";
import EmployeesAccess from "./EmployeesAccess.jsx";
import ActivityLog from "./ActivityLog.jsx";
import AccountPanel from "./AccountPanel.jsx";
import MentionText, { MentionSuggestions, TaskLine } from "./MentionText.jsx";
import { useMentionInput, mentionIds } from "./mentions.js";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import "./styles.css";

const API = axios.create({
  baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com",
});

// The installed app (see public/manifest.webmanifest) opens with ?view=internal-chat
const LAUNCH_PARAMS = new URLSearchParams(window.location.search);
// Notifications can also open straight into Internal Audit (?view=findings).
const LAUNCH_VIEW = ["internal-chat", "findings"].includes(LAUNCH_PARAMS.get("view")) ? LAUNCH_PARAMS.get("view") : null;
// Tapping a chat notification opens ?view=internal-chat&chat=<id>&department=<dept>
const LAUNCH_CHAT = LAUNCH_PARAMS.get("chat") ? { chatId: LAUNCH_PARAMS.get("chat"), department: LAUNCH_PARAMS.get("department") } : null;
// A "customer replied" notification opens ?view=tickets&ticket=<id>&phone=<phone>
const LAUNCH_TICKET = LAUNCH_PARAMS.get("ticket") ? { ticketId: LAUNCH_PARAMS.get("ticket"), phone: LAUNCH_PARAMS.get("phone") || "" } : null;
// Pages a person can be given (the server decides; this mirrors it for the menu).
const ALL_PAGE_KEYS = ["tickets", "feedback", "products", "operations", "audit", "findings", "expiry", "analytics", "activity", "settings"];
const OPERATIONS_VIEWS = ["inventory", "clients", "brands", "performance", "leads", "routes", "demand", "import"];
// Until the server answers /me, people keep what they had before roles existed.
function defaultAccess(role, department) {
  if (role === "admin") return { accessRole: "admin", roleLabel: "Owner", pages: ALL_PAGE_KEYS, readOnly: false, isAdmin: true };
  const pages = department === "Operations" ? ["operations", "audit", "findings", "expiry"] : department === "Audit" ? ["audit", "findings", "expiry"] : ["findings", "expiry"];
  return { accessRole: "staff", roleLabel: "Staff", pages, readOnly: false, isAdmin: false };
}
function readStoredAccess() {
  try {
    return JSON.parse(localStorage.getItem("userAccess") || "null");
  } catch {
    return null;
  }
}
const pickAccess = (data) => ({ accessRole: data.accessRole, roleLabel: data.roleLabel, pages: data.pages || [], readOnly: Boolean(data.readOnly), isAdmin: Boolean(data.isAdmin) });

// Older chats begin with an automatic "New <department> team chat started." message; don't show it.
const isChatStartedNotice = (message) => message?.sender === "Admin" && /^New .+ team chat started\.$/.test(String(message.text || "").trim());

// Chat ids are numbers on the server but arrive as text from notifications.
const toChatId = (value) => (Number.isNaN(Number(value)) ? value : Number(value));

const COLORS = ["#e8192c", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#f97316"];

// ─── Icons ───────────────────────────────────────────────────────────────────
const Icon = {
  ticket: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6z" />
    </svg>
  ),
  feedback: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8z" />
    </svg>
  ),
  product: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  ),
  analytics: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  ),
  bell: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  logout: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
  search: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  ),
  send: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  refresh: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  close: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  chat: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  trendUp: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  settings: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.42 1.42-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20h-2v-.08a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-1.42-1.42.06-.06A1.7 1.7 0 0 0 9.4 15a1.7 1.7 0 0 0-1.56-1.03H7v-2h.84A1.7 1.7 0 0 0 9.4 10a1.7 1.7 0 0 0-.34-1.88L9 8.06l1.42-1.42.06.06A1.7 1.7 0 0 0 12.36 7.7 1.7 1.7 0 0 0 13.4 6.14V6h2v.14a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.42 1.42-.06.06A1.7 1.7 0 0 0 19.4 10a1.7 1.7 0 0 0 1.56 1.03H21v2h-.04A1.7 1.7 0 0 0 19.4 15z" />
    </svg>
  ),
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: "#fff",
        border: "1px solid #e2e6ef",
        borderRadius: "12px",
        padding: "12px 16px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        fontSize: "12.5px",
        minWidth: "130px",
      }}>
        <div style={{
          fontWeight: 700, color: "#8c96ae", marginBottom: 8,
          fontSize: 10, textTransform: "uppercase", letterSpacing: "0.8px"
        }}>
          {label}
        </div>
        {payload.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4 }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: p.fill || p.stroke, flexShrink: 0, display: "inline-block"
            }} />
            <span style={{ color: "#4a5468", fontSize: 12 }}>{p.name}:</span>
            <span style={{ fontWeight: 700, color: "#0b0f1a", marginLeft: "auto", paddingLeft: 10 }}>
              {p.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [userRole, setUserRole] = useState(localStorage.getItem("userRole") || "admin");
  const [currentUserName, setCurrentUserName] = useState(localStorage.getItem("userName") || "Admin");
  const [currentUserDepartment, setCurrentUserDepartment] = useState(localStorage.getItem("userDepartment") || "Accounts");
  const [currentUserId, setCurrentUserId] = useState(localStorage.getItem("userId") || "");
  const [currentUsername, setCurrentUsername] = useState(localStorage.getItem("userUsername") || "");
  const [access, setAccess] = useState(readStoredAccess);
  const [showAccount, setShowAccount] = useState(false);
  const [employeeCredentials, setEmployeeCredentials] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginInProgress, setLoginInProgress] = useState(false);
  const chatEndRef = useRef(null);

  const [tickets, setTickets] = useState([]);
  const [upiScanTicketId, setUpiScanTicketId] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [products, setProducts] = useState([]);
  const [lowStockSummary, setLowStockSummary] = useState([]);
  const [renewalsSummary, setRenewalsSummary] = useState([]);

  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);

  const [analyticsDaily, setAnalyticsDaily] = useState([]);
  const [analyticsDailyKeys, setAnalyticsDailyKeys] = useState([]);
  const [analyticsMonthly, setAnalyticsMonthly] = useState([]);
  const [analyticsCategory, setAnalyticsCategory] = useState([]);
  const [selectedIssue, setSelectedIssue] = useState("ALL");
  const [refundDaily, setRefundDaily] = useState([]);

const [refundMonthly, setRefundMonthly] = useState([]);
const [editingRefundId, setEditingRefundId] = useState(null);
const [refundAmountInput, setRefundAmountInput] = useState("");
const [totalRefundToday, setTotalRefundToday] = useState(0);
const [totalRefundMonth, setTotalRefundMonth] = useState(0);

  const [requestedView, setView] = useState(LAUNCH_VIEW || "tickets");
  // The shared owner login is "admin" in chats; named admins keep their own chat identity.
  const isOwner = userRole === "admin";
  const myAccess = access || defaultAccess(userRole, currentUserDepartment);
  const isAdmin = isOwner || Boolean(myAccess.isAdmin);
  const can = (page) => isAdmin || (myAccess.pages || []).includes(page);
  const canAccessOperations = can("operations");
  const canAccessAudit = can("audit");
  // A page someone can't open falls back to their home page.
  const viewAllowed = (name) => {
    if (OPERATIONS_VIEWS.includes(name)) return canAccessOperations;
    if (["employees", "admin-settings"].includes(name)) return isAdmin;
    if (name === "internal-chat") return true;
    return ALL_PAGE_KEYS.includes(name) ? can(name) : false;
  };
  const view = viewAllowed(requestedView) ? requestedView : can("tickets") ? "tickets" : "internal-chat";
  // Mobile-only UI state (ignored by the desktop layout)
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileChatPane, setMobileChatPane] = useState(LAUNCH_CHAT ? "conversation" : "list");
  const [showTicketTools, setShowTicketTools] = useState(false);
  useEffect(() => { setMobileNavOpen(false); }, [view]);
  // Phones get the WhatsApp-style chat (MobileChat.jsx); desktop keeps the three-column layout
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 768px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 768px)");
    const onChange = (event) => setIsMobile(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [loadingId, setLoadingId] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [paytmVerificationEnabled, setPaytmVerificationEnabled] = useState(false);
  const [settings, setSettings] = useState({
    paytm_verification_enabled: false,
    auto_close_inactive_tickets: true,
    auto_close_minutes: 5,
    premium_message_mode: true,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [ticketDraft, setTicketDraft] = useState({ priority: "normal", assigned_to: "", admin_notes: "" });

  const departments = ["Accounts", "HR", "Operations", "Product", "Audit", "Technical", "Orders", "Logistics"];
  const [internalUsers, setInternalUsers] = useState([]);
  const [internalChats, setInternalChats] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState(LAUNCH_CHAT?.department || localStorage.getItem("userDepartment") || "Accounts");
  const [selectedInternalChatId, setSelectedInternalChatId] = useState(LAUNCH_CHAT ? toChatId(LAUNCH_CHAT.chatId) : null);
  const [internalMessage, setInternalMessage] = useState("");
  const [internalPriority, setInternalPriority] = useState("medium");
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const attachmentInputRef = useRef(null);
  const [internalSearch, setInternalSearch] = useState("");
  const [teamSearch, setTeamSearch] = useState("");
  const [showTeamPanel, setShowTeamPanel] = useState(() => {
    try { return localStorage.getItem("chatTeamPanel") !== "hidden"; } catch { return true; }
  });
  // On narrower screens the team panel slides over the chat, so it starts closed there.
  const [teamOverlayOpen, setTeamOverlayOpen] = useState(false);
  const toggleTeamPanel = () => {
    if (window.innerWidth <= 1280) {
      setTeamOverlayOpen((value) => !value);
      return;
    }
    setShowTeamPanel((value) => {
      try { localStorage.setItem("chatTeamPanel", value ? "hidden" : "shown"); } catch { /* per-browser preference only */ }
      return !value;
    });
  };
  const matchesTeamSearch = (...fields) => !teamSearch.trim() || fields.some((field) => String(field || "").toLowerCase().includes(teamSearch.trim().toLowerCase()));
  const [internalFilter, setInternalFilter] = useState("all");
  const [showArchivedChats, setShowArchivedChats] = useState(false);
  const [internalReplyTo, setInternalReplyTo] = useState(null);
  const [savedReplies, setSavedReplies] = useState([]);
  const [showSavedReplyForm, setShowSavedReplyForm] = useState(false);
  const [savedReplyDraft, setSavedReplyDraft] = useState({ title: "", text: "" });
  const [notificationToast, setNotificationToast] = useState(null);
  const [newEmployee, setNewEmployee] = useState({ name: "", department: "Accounts", role: "Analyst", tags: "finance, operations" });
  const [adminProfile, setAdminProfile] = useState(() => ({
    displayName: localStorage.getItem("adminDisplayName") || "Snackit Admin",
    email: localStorage.getItem("adminEmail") || "",
    logo: localStorage.getItem("adminLogo") || "/logo.png",
    compactMode: localStorage.getItem("adminCompactMode") === "true",
  }));
  const socketRef = useRef(null);
  const selectedInternalChatIdRef = useRef(null);
  const mentionAudioContextRef = useRef(null);

  // "on" means the service worker already shows a notification for every chat message.
  const [pushState, setPushState] = useState("off");
  const pushStateRef = useRef("off");
  useEffect(() => { pushStateRef.current = pushState; }, [pushState]);

  const triggerInternalNotification = useCallback((title, priority, message) => {
    setNotificationToast({ title, priority, message });
    if (typeof window !== "undefined" && "Notification" in window && pushStateRef.current !== "on" && document.visibilityState !== "visible") {
      showLocalNotification(title, message);
    }
    window.setTimeout(() => setNotificationToast(null), 3500);
  }, []);

  // Tone for new chat messages while the app is open (the phone plays its own sound for pop-ups).
  const [chatSoundOn, setChatSoundOn] = useState(localStorage.getItem("chatSound") !== "off");
  const chatSoundOnRef = useRef(chatSoundOn);
  const lastChatSoundRef = useRef(0);
  const playMessageSound = useCallback((force = false) => {
    if (!force && (!chatSoundOnRef.current || Date.now() - lastChatSoundRef.current < 1500)) return;
    lastChatSoundRef.current = Date.now();
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!mentionAudioContextRef.current) mentionAudioContextRef.current = new AudioContext();
      const context = mentionAudioContextRef.current;
      if (context.state === "suspended") context.resume().catch(() => null);
      // Two soft rising notes, like a chat app.
      [[660, 0], [990, 0.13]].forEach(([frequency, delay]) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + delay;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.2, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.22);
      });
    } catch (err) {
      console.log("Message sound unavailable:", err);
    }
  }, []);

  const toggleChatSound = (on) => {
    setChatSoundOn(on);
    chatSoundOnRef.current = on;
    localStorage.setItem("chatSound", on ? "on" : "off");
    if (on) playMessageSound(true);
  };

  // iPhone only lets a page play sound after the first tap, so unlock audio then.
  useEffect(() => {
    const unlock = () => {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!mentionAudioContextRef.current) mentionAudioContextRef.current = new AudioContext();
      mentionAudioContextRef.current.resume().catch(() => null);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const playInternalMentionAlert = useCallback(() => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!mentionAudioContextRef.current) mentionAudioContextRef.current = new AudioContext();
      const context = mentionAudioContextRef.current;
      if (context.state === "suspended") context.resume().catch(() => null);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.24);
    } catch (err) {
      console.log("Internal mention sound unavailable:", err);
    }
  }, []);

  const departmentUsers = internalUsers.filter((user) => user.department === selectedDepartment);
  const departmentChats = internalChats.filter((chat) => chat.department === selectedDepartment);
  // Direct (one-to-one) chats live under the "Direct" tab; the server only sends your own.
  const myChatKey = isOwner ? "admin" : String(currentUserId);
  const nameForChatKey = (key) => (key === "admin" ? "Admin" : internalUsers.find((user) => String(user.id) === String(key))?.name);
  const chatDisplayName = (chat) => {
    if (chat?.type !== "direct") return chat?.title || "";
    const other = (chat.members || []).find((key) => key !== myChatKey);
    return nameForChatKey(other) || (chat.participants || []).find((name) => name !== currentUserName) || "Direct chat";
  };
  const directPeople = [
    { key: "admin", name: "Admin", role: "Admin" },
    ...internalUsers.map((user) => ({ key: String(user.id), name: user.name, role: [user.role, user.department].filter(Boolean).join(" · ") })),
  ].filter((person) => person.key !== myChatKey);
  // In a department group, only that department's people can be @tagged.
  const taggablePeople = selectedDepartment === "Direct"
    ? []
    : internalUsers.filter((user) => user.department === selectedDepartment && String(user.id) !== myChatKey);
  const taggedNames = (message) => (message.mentions || []).map((id) => internalUsers.find((user) => String(user.id) === String(id))?.name).filter(Boolean);
  const isTaggedMe = (message) => (message.mentions || []).map(String).includes(myChatKey);
  // Newest activity first, like WhatsApp (message ids are timestamps).
  const lastActivity = (chat) => Number(chat.messages?.at(-1)?.id || chat.id || 0);

  const visibleDepartmentChats = departmentChats
    .filter((chat) => showArchivedChats || !chat.archived)
    .filter((chat) => {
      if (internalFilter === "unread") return Number(chat.unread || 0) > 0;
      if (internalFilter === "pinned") return chat.pinned;
      if (internalFilter === "favorites") return chat.favorite;
      return true;
    })
    .filter((chat) => {
      const query = internalSearch.trim().toLowerCase();
      if (!query) return true;
      return [chatDisplayName(chat), ...(chat.participants || []), chat.messages?.at(-1)?.text].some((value) => String(value || "").toLowerCase().includes(query));
    })
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || lastActivity(b) - lastActivity(a));
  const availableDepartments = ["Direct", ...departments];
  const selectedInternalChat = departmentChats.find((chat) => chat.id === selectedInternalChatId)
    || visibleDepartmentChats[0]
    || null;

  useEffect(() => {
    selectedInternalChatIdRef.current = selectedInternalChatId;
  }, [selectedInternalChatId]);

  useEffect(() => {
    if (selectedDepartment && !departmentChats.some((chat) => chat.id === selectedInternalChatId) && departmentChats[0]) {
      setSelectedInternalChatId(departmentChats[0].id);
    }
  }, [selectedDepartment, departmentChats, selectedInternalChatId]);

  // Desktop always shows the selected chat, so it counts as read; on phones only once it is opened
  const internalChatOnScreen = !isMobile || mobileChatPane === "conversation";
  const desktopMessagesRef = useRef(null);
  const selectedMessageCount = selectedInternalChat?.messages?.length || 0;
  useEffect(() => {
    if (desktopMessagesRef.current) desktopMessagesRef.current.scrollTop = desktopMessagesRef.current.scrollHeight;
  }, [selectedInternalChat?.id, selectedMessageCount, view]);
  useEffect(() => {
    if (selectedInternalChat?.id && internalChatOnScreen) markInternalChatRead(selectedInternalChat.id);
  }, [selectedInternalChat?.id, internalChatOnScreen]);

  const handleSendInternalMessage = async () => {
    const messageText = internalMessage.trim();
    const hasAttachment = attachedFiles.length > 0;
    if (!messageText && !hasAttachment) return;

    try {
      let activeChat = selectedInternalChat;
      if (!activeChat && selectedDepartment === "Direct") {
        alert("Choose a person to chat with first.");
        return;
      }
      if (!activeChat) {
        const createdChat = await API.post(
          "/internal/chats",
          {
            department: selectedDepartment,
            title: `${selectedDepartment} chat`,
            priority: internalPriority,
            participants: departmentUsers.map((user) => user.name),
          },
          { headers: authHeaders() }
        );

        if (createdChat.data?.chat) {
          setInternalChats((prev) => [createdChat.data.chat, ...prev]);
          activeChat = createdChat.data.chat;
          setSelectedInternalChatId(createdChat.data.chat.id);
        }
      }

      if (!activeChat) return;

      const serializedAttachments = await Promise.all(attachedFiles.map((file) => new Promise((resolve, reject) => {
        const maxFileSize = 6 * 1024 * 1024;
        if (file.size > maxFileSize) {
          reject(new Error(`${file.name} is larger than 6 MB`));
          return;
        }

        const reader = new FileReader();
        reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
        reader.onload = () => {
          if (!file.type.startsWith("image/")) {
            resolve({ name: file.name, type: file.type, size: file.size, dataUrl: reader.result });
            return;
          }

          const image = new Image();
          image.onerror = () => reject(new Error(`Could not process ${file.name}`));
          image.onload = () => {
            const maxDimension = 1800;
            const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve({
              name: file.name,
              type: "image/jpeg",
              size: file.size,
              dataUrl: canvas.toDataURL("image/jpeg", 0.82),
            });
          };
          image.src = reader.result;
        };
        reader.readAsDataURL(file);
      })));

      const serializedSize = serializedAttachments.reduce((total, file) => total + (file.dataUrl?.length || 0), 0);
      if (serializedSize > 18_000_000) {
        throw new Error("Attachments are too large together. Remove a file or send them separately.");
      }

      const response = await API.post(
        `/internal/chats/${activeChat.id}/messages`,
        {
          sender: currentUserName,
          text: messageText,
          tag: null,
          priority: internalPriority,
          sourceUser: currentUserName,
          attachments: serializedAttachments,
          // Everyone in the group sees it; @tags mark who needs to act.
          recipientIds: [],
          replyTo: internalReplyTo?.id || null,
          mentions: mentionIds(messageText, taggablePeople),
          notifyAll: true,
        },
        { headers: authHeaders() }
      );

      if (response.data?.chat) {
        setInternalChats((prev) => prev.map((chat) =>
          String(chat.id) === String(response.data.chat.id) ? response.data.chat : chat
        ));
      }

      triggerInternalNotification(
        `${selectedDepartment} update`,
        internalPriority,
        messageText || "Attachment sent"
      );

      setInternalMessage("");
      setInternalReplyTo(null);
      setAttachedFiles([]);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    } catch (err) {
      alert(err.response?.data?.error || err.message || "Failed to send internal message");
      console.log(err);
    }
  };

  const deskInputRef = useRef(null);
  const deskMention = useMentionInput({
    inputRef: deskInputRef,
    value: internalMessage,
    setValue: setInternalMessage,
    people: taggablePeople,
    onEnter: () => handleSendInternalMessage(),
  });

  const handleUpdateMessageStatus = async (chatId, messageId, status) => {
    try {
      const response = await API.patch(
        `/internal/chats/${chatId}/messages/${messageId}/status`,
        { status },
        { headers: authHeaders() }
      );
      if (response.data?.chat) {
        setInternalChats((prev) => prev.map((chat) => String(chat.id) === String(response.data.chat.id) ? response.data.chat : chat));
      }
    } catch (err) {
      alert("Failed to update message status");
      console.log(err);
    }
  };

  const updateInternalChat = async (chatId, updates) => {
    try {
      const response = await API.patch(`/internal/chats/${chatId}`, updates, { headers: authHeaders() });
      if (response.data?.chat) setInternalChats((prev) => prev.map((chat) => String(chat.id) === String(chatId) ? response.data.chat : chat));
    } catch (err) {
      alert(err.response?.data?.error || "Failed to update chat");
    }
  };

  async function markInternalChatRead(chatId) {
    if (!chatId) return;
    setInternalChats((prev) => prev.map((chat) => String(chat.id) === String(chatId) ? { ...chat, unread: 0 } : chat));
    try {
      await API.patch(`/internal/chats/${chatId}/read`, {}, { headers: authHeaders() });
    } catch (err) {
      console.log("Mark internal chat read error:", err);
    }
  }

  const updateInternalMessage = async (chatId, messageId, updates) => {
    try {
      const response = await API.patch(`/internal/chats/${chatId}/messages/${messageId}`, updates, { headers: authHeaders() });
      if (response.data?.chat) setInternalChats((prev) => prev.map((chat) => String(chat.id) === String(chatId) ? response.data.chat : chat));
    } catch (err) {
      alert(err.response?.data?.error || "Failed to update message");
    }
  };

  const saveInternalReply = async (event) => {
    event.preventDefault();
    try {
      const response = await API.post("/internal/saved-replies", savedReplyDraft, { headers: authHeaders() });
      if (response.data?.reply) setSavedReplies((prev) => [response.data.reply, ...prev]);
      setSavedReplyDraft({ title: "", text: "" });
      setShowSavedReplyForm(false);
    } catch (err) {
      alert(err.response?.data?.error || "Failed to save reply");
    }
  };

  const handleAddEmployee = async (event) => {
    event.preventDefault();
    const cleanName = newEmployee.name.trim();
    if (!cleanName) return;

    const payload = {
      name: cleanName,
      department: newEmployee.department,
      role: newEmployee.role || "Member",
      tags: newEmployee.tags,
      isAdmin: false,
    };

    try {
      const response = await API.post("/internal/users", payload, { headers: authHeaders() });
      if (response.data?.user) {
        setInternalUsers((prev) => [...prev, response.data.user]);
      }
      if (response.data?.credentials) {
        setEmployeeCredentials(response.data.credentials);
      }
      setNewEmployee({ name: "", department: newEmployee.department, role: "Analyst", tags: "finance, operations" });
      triggerInternalNotification("New employee added", "medium", `${cleanName} was added to ${newEmployee.department} as ${payload.role}`);
    } catch (err) {
      alert("Failed to add employee");
      console.log(err);
    }
  };

  // ✅ Track previous message count and typing timeout for indicator
  const prevMessageCountRef = useRef(0);
  const typingTimeoutRef = useRef(null);
  const ticketsLoadedRef = useRef(false);

  /* =========================================================================
     AUTH
  ========================================================================= */
  const login = async () => {
    if (loginInProgress || !username.trim() || !password) return;
    setLoginInProgress(true);
    try {
      const res = await API.post("/login", { username: username.trim(), password });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("userRole", res.data.role || "admin");
      localStorage.setItem("userName", res.data.name || "Admin");
      localStorage.setItem("userDepartment", res.data.department || "Accounts");
      localStorage.setItem("userId", res.data.userId || "");
      localStorage.setItem("userUsername", res.data.username || "");
      localStorage.setItem("userAccess", JSON.stringify(pickAccess(res.data)));
      setCurrentUsername(res.data.username || "");
      setAccess(pickAccess(res.data));
      setToken(res.data.token);
      setUserRole(res.data.role || "admin");
      setCurrentUserName(res.data.name || "Admin");
      setCurrentUserDepartment(res.data.department || "Accounts");
      setCurrentUserId(res.data.userId || "");
      setSelectedDepartment(res.data.department || "Accounts");
      setView(LAUNCH_VIEW || (res.data.isAdmin || (res.data.pages || []).includes("tickets") ? "tickets" : "internal-chat"));
      setSessionExpired(false);
    } catch (err) {
      alert(err.response?.status === 401 ? "Wrong username or password" : "Login failed. Check your connection and try again.");
    } finally {
      setLoginInProgress(false);
    }
  };

  const saveAdminProfile = async () => {
    const nextProfile = {
      ...adminProfile,
      displayName: adminProfile.displayName.trim() || "Snackit Admin",
      email: adminProfile.email.trim(),
    };
    try {
      const response = await API.post(
        "/admin/settings",
        { admin_logo: nextProfile.logo },
        { headers: authHeaders() }
      );
      const savedLogo = response.data?.admin_logo || nextProfile.logo;
      const savedProfile = { ...nextProfile, logo: savedLogo };
      localStorage.setItem("adminDisplayName", savedProfile.displayName);
      localStorage.setItem("adminEmail", savedProfile.email);
      localStorage.setItem("adminLogo", savedProfile.logo);
      localStorage.setItem("adminCompactMode", String(savedProfile.compactMode));
      setAdminProfile(savedProfile);
      setCurrentUserName(savedProfile.displayName);
      localStorage.setItem("userName", savedProfile.displayName);
      alert("Admin settings saved");
    } catch (err) {
      alert(err.response?.data?.error || "Could not save admin settings");
    }
  };

  const handleAdminLogoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("Logo must be smaller than 2 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAdminProfile((profile) => ({ ...profile, logo: String(reader.result) }));
    reader.onerror = () => alert("Could not read that logo file");
    reader.readAsDataURL(file);
  };

  const logoutRef = useRef(null);
  const logout = () => {
    disablePush(API, { Authorization: `Bearer ${token}` });
    API.post("/logout", {}, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    setPushState("off");
    localStorage.removeItem("token");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    localStorage.removeItem("userDepartment");
    localStorage.removeItem("userId");
    localStorage.removeItem("userUsername");
    localStorage.removeItem("userAccess");
    setAccess(null);
    setCurrentUsername("");
    setToken("");
    setUserRole("admin");
    setCurrentUserName("Admin");
    setCurrentUserDepartment("Accounts");
    setCurrentUserId("");
    setActiveChat(null);
    setMessages([]);
  };
  useEffect(() => {
    logoutRef.current = () => {
      alert("Your login has expired. Please log in again.");
      logout();
    };
  });

  /* =========================================================================
     FETCH HELPERS
  ========================================================================= */
  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  useEffect(() => {
    if (!token) return;
    getPushState().then(setPushState).catch(() => setPushState("unsupported"));
    syncPush(API, authHeaders()).catch(() => null);
  }, [token, authHeaders]);

  const [showNotifySettings, setShowNotifySettings] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);

  const turnOnNotifications = async () => {
    setNotifyBusy(true);
    try {
      const state = await enablePush(API, authHeaders());
      setPushState(state);
      // Blocked: show how to allow them in settings.
      if (state === "denied") setShowNotifySettings(true);
    } catch (err) {
      console.error("Enable notifications failed:", err);
      alert("Could not turn on notifications. Please try again.");
    } finally {
      setNotifyBusy(false);
    }
  };

  // After allowing notifications in phone settings.
  const recheckNotifications = async () => {
    const state = await getPushState().catch(() => "unsupported");
    if (state === "denied") {
      setPushState(state);
      alert("Notifications still look blocked. Please check the steps again.");
      return;
    }
    if (state === "off") return turnOnNotifications();
    setPushState(state);
  };

  const sendTestNotification = async () => {
    setNotifyBusy(true);
    try {
      await API.post("/internal/push/test", {}, { headers: authHeaders() });
    } catch (err) {
      alert(err.response?.data?.error || "Could not send a test notification.");
    } finally {
      setNotifyBusy(false);
    }
  };

  // Coming back from phone settings: pick up the new permission without another tap.
  useEffect(() => {
    if (!token) return;
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      const state = await getPushState().catch(() => "unsupported");
      if (state === "off" && "Notification" in window && Notification.permission === "granted") {
        enablePush(API, authHeaders()).then(setPushState).catch(() => setPushState("off"));
      } else {
        setPushState(state);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [token, authHeaders]);

  // Open the chat a notification was about: on launch, or when the app was already open.
  const openChatFromNotification = useCallback(({ chatId, department }) => {
    if (!chatId) return;
    setView("internal-chat");
    if (department) setSelectedDepartment(department);
    setSelectedInternalChatId(toChatId(chatId));
    setMobileChatPane("conversation");
  }, []);

  // Opens a customer ticket chat from a notification; the notification only
  // comes for tickets an admin has taken over.
  const ticketsRef = useRef([]);
  useEffect(() => { ticketsRef.current = tickets; }, [tickets]);
  const openTicketFromNotification = useCallback(({ ticketId, phone }) => {
    const id = Number(ticketId);
    if (!id) return;
    setView("tickets");
    setActiveChat(ticketsRef.current.find((ticket) => ticket.id === id) || { id, phone, takeover: true });
    setMessages([]);
  }, []);

  useEffect(() => {
    if (!token || !LAUNCH_TICKET) return;
    window.history.replaceState(null, "", "/");
    // Give the ticket list a moment to load so the chat shows the full ticket.
    const timer = setTimeout(() => openTicketFromNotification(LAUNCH_TICKET), 1200);
    return () => clearTimeout(timer);
  }, [token, openTicketFromNotification]);

  useEffect(() => {
    if (LAUNCH_CHAT) window.history.replaceState(null, "", "/?view=internal-chat");
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event) => {
      if (event.data?.type === "open-internal-chat") openChatFromNotification(event.data);
      if (event.data?.type === "open-view" && event.data.view === "findings") setView("findings");
      if (event.data?.type === "open-ticket") openTicketFromNotification(event.data);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [openChatFromNotification, openTicketFromNotification]);

  // Access can change while someone is logged in (an admin edits their role), so check regularly.
  const refreshMe = useCallback(async () => {
    if (!token) return;
    try {
      const response = await API.get("/me", { headers: authHeaders() });
      const next = pickAccess(response.data);
      localStorage.setItem("userAccess", JSON.stringify(next));
      setAccess((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    } catch (err) {
      if (err.response?.status === 401) logoutRef.current?.();
    }
  }, [token, authHeaders]);

  useEffect(() => {
    const first = setTimeout(refreshMe, 0);
    const timer = setInterval(refreshMe, 60000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [refreshMe]);

  const fetchTickets = useCallback(async () => {
    if (!token) return;
    try {
      const res = await API.get("/tickets", { headers: authHeaders() });
      setTickets((prev) => {
        const incoming = Array.isArray(res.data) ? res.data : [];
        const previousIds = new Set(prev.map((ticket) => ticket.id));
        const hasNewTicket = incoming.some((ticket) => !previousIds.has(ticket.id));
        if (ticketsLoadedRef.current && hasNewTicket && document.visibilityState === "visible" && "Notification" in window) {
          if (Notification.permission === "granted") {
            showLocalNotification("New support ticket", "A new customer request needs attention.");
          } else if (Notification.permission === "default") {
            Notification.requestPermission();
          }
        }
        ticketsLoadedRef.current = true;
        const prevStr = JSON.stringify(prev.map((t) => ({ id: t.id, status: t.status, state: t.state, takeover: t.takeover, priority: t.priority, assigned_to: t.assigned_to, admin_notes: t.admin_notes })));
        const nextStr = JSON.stringify(incoming.map((t) => ({ id: t.id, status: t.status, state: t.state, takeover: t.takeover, priority: t.priority, assigned_to: t.assigned_to, admin_notes: t.admin_notes })));
        return prevStr === nextStr ? prev : incoming;
      });
      setSessionExpired(false);
    } catch (err) {
      if (err.response?.status === 401 && !sessionExpired) {
        setSessionExpired(true);
        alert("Session expired. Please login again.");
        logout();
      }
    }
  }, [token, authHeaders, sessionExpired]);

  const fetchSettings = useCallback(async () => {
    if (!token) return;
    try {
      const res = await API.get("/admin/settings", { headers: authHeaders() });
      const nextSettings = {
        paytm_verification_enabled: Boolean(res.data?.paytm_verification_enabled),
        auto_close_inactive_tickets: Boolean(res.data?.auto_close_inactive_tickets),
        auto_close_minutes: Number(res.data?.auto_close_minutes) || 5,
        premium_message_mode: Boolean(res.data?.premium_message_mode),
      };
      setSettings(nextSettings);
      setPaytmVerificationEnabled(nextSettings.paytm_verification_enabled);
      if (res.data?.admin_logo) {
        setAdminProfile((profile) => ({ ...profile, logo: res.data.admin_logo }));
        localStorage.setItem("adminLogo", res.data.admin_logo);
      }
    } catch (err) {
      console.log("Settings error:", err);
    }
  }, [token, authHeaders]);

  const fetchFeedback = useCallback(async () => {
    if (!token) return;
    try {
      const res = await API.get("/feedback", { headers: authHeaders() });
      setFeedback(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.log("Feedback error:", err);
    }
  }, [token, authHeaders]);

  const fetchProducts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await API.get("/product-leads", { headers: authHeaders() });
      setProducts(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.log("Product error:", err);
    }
  }, [token, authHeaders]);

  const fetchOperationsSummary = useCallback(async () => {
    if (!token || !canAccessOperations) return;
    try {
      const headers = authHeaders();
      const [lowStock, renewals] = await Promise.all([
        API.get("/inventory/low-stock", { headers, params: { days: 7 } }),
        API.get("/host-sites/renewals-due", { headers, params: { days: 60 } }),
      ]);
      setLowStockSummary(Array.isArray(lowStock.data) ? lowStock.data.slice(0, 10) : []);
      setRenewalsSummary(Array.isArray(renewals.data) ? renewals.data.slice(0, 6) : []);
    } catch (err) {
      console.log("Operations summary error:", err);
    }
  }, [token, authHeaders, canAccessOperations]);

  const fetchInternalData = useCallback(async () => {
    if (!token) return;
    try {
      const [usersRes, chatsRes, repliesRes] = await Promise.all([
        API.get("/internal/users", { headers: authHeaders() }),
        API.get("/internal/chats", { headers: authHeaders() }),
        API.get("/internal/saved-replies", { headers: authHeaders() }),
      ]);

      setInternalUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
      setInternalChats(Array.isArray(chatsRes.data) ? chatsRes.data : []);
      setSavedReplies(Array.isArray(repliesRes.data) ? repliesRes.data : []);
    } catch (err) {
      console.log("Internal data error:", err);
      // The server no longer knows this login: go back to the login screen instead of showing empty chats.
      if (err.response?.status === 401) logoutRef.current?.();
    }
  }, [token, authHeaders]);

  // Keep chats fresh even if the live connection drops (e.g. phone was in the background).
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") fetchInternalData();
    }, 15000);
    const onVisible = () => { if (document.visibilityState === "visible") fetchInternalData(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, fetchInternalData]);

  const handleDeleteChat = useCallback(async (chatId) => {
    if (!isAdmin || !chatId) return;
    const confirmDelete = window.confirm("Delete this department chat?");
    if (!confirmDelete) return;

    try {
      await API.delete(`/internal/chats/${chatId}`, { headers: authHeaders() });
      setInternalChats((prev) => prev.filter((chat) => String(chat.id) !== String(chatId)));
      setSelectedInternalChatId((prev) => (String(prev) === String(chatId) ? null : prev));
    } catch (err) {
      alert("Failed to delete chat");
      console.log(err);
    }
  }, [isAdmin, authHeaders]);

  const handleDeleteUser = useCallback(async (userId) => {
    if (!isAdmin || !userId) return;
    const confirmDelete = window.confirm("Delete this employee from the department team?");
    if (!confirmDelete) return;

    try {
      await API.delete(`/internal/users/${userId}`, { headers: authHeaders() });
      setInternalUsers((prev) => prev.filter((user) => String(user.id) !== String(userId)));
    } catch (err) {
      alert("Failed to delete employee");
      console.log(err);
    }
  }, [isAdmin, authHeaders]);

  // ✅ FIX: Added typing indicator logic
  const fetchMessages = useCallback(async (ticketId) => {
    if (!token || !ticketId) return;
    try {
      const res = await API.get(`/admin/messages/${ticketId}`, {
        headers: authHeaders(),
      });
      const newMessages = Array.isArray(res.data) ? res.data : [];
      
      // Check if new user message arrived
      if (newMessages.length > prevMessageCountRef.current) {
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg.sender === 'user') {
          setTyping(true);
          // Clear existing timeout
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          // Show typing indicator for 2 seconds
          typingTimeoutRef.current = setTimeout(() => setTyping(false), 2000);
        }
      }
      
      prevMessageCountRef.current = newMessages.length;
      setMessages(newMessages);
    } catch (err) {
      console.error("fetchMessages error:", err);
    }
  }, [token, authHeaders]);

  const fetchAnalytics = useCallback(async () => {
    if (!token) return;
    try {
      const headers = authHeaders();
      const [daily, monthly, category] = await Promise.all([
        API.get("/analytics/product-not-dispensed", { headers }),
        API.get("/analytics/monthly", { headers }),
        API.get("/analytics/category", { headers }),
      ]);

      if (Array.isArray(daily.data)) {
        const grouped = {};
        const keys = [];
        daily.data.forEach((x) => {
          const date = x.date ? new Date(x.date).toLocaleDateString() : "-";
          const subIssue = x.sub_issue || "No Sub Issue";
          const count = Number(x.count || 0);
          if (!keys.includes(subIssue)) keys.push(subIssue);
          if (!grouped[date]) grouped[date] = { date };
          grouped[date][subIssue] = count;
        });
        setAnalyticsDaily(Object.values(grouped));
        setAnalyticsDailyKeys(keys);
      }

      setAnalyticsMonthly(
        Array.isArray(monthly.data)
          ? monthly.data.map((x) => ({
              month: x.month
                ? new Date(x.month).toLocaleDateString("en-US", { month: "short", year: "numeric" })
                : "-",
              count: Number(x.count || 0),
            }))
          : []
      );

      setAnalyticsCategory(
        Array.isArray(category.data)
          ? category.data.map((x) => ({
              issue: `${x.main_issue || "Unknown"} - ${x.sub_issue || "Unknown"}`,
              count: Number(x.count || 0),
            }))
          : []
      );
    } catch (err) {
      console.log("Analytics error:", err);
    }
  }, [token, authHeaders]);

  const fetchRefundAnalytics = useCallback(async () => {
    if (!token) return;
    try {
      const headers = authHeaders();
      const [daily, monthly] = await Promise.all([
        API.get("/analytics/refunds-daily", { headers }),
        API.get("/analytics/refunds-monthly", { headers }),
      ]);

      setRefundDaily(Array.isArray(daily.data) ? daily.data : []);
      setRefundMonthly(Array.isArray(monthly.data) ? monthly.data : []);

      // Calculate totals
      const todayDate = new Date().toLocaleDateString("en-CA");

const todayTotal =
  daily.data?.find((d) => {
    const formattedDate = new Date(d.date)
      .toLocaleDateString("en-CA");
    return formattedDate === todayDate;
  })?.total_refund || 0;
      const currentMonth = new Date().toLocaleDateString("en-CA").slice(0, 7); // YYYY-MM

const monthTotal =
  monthly.data?.find((m) => {
    const formattedMonth = new Date(m.month)
      .toLocaleDateString("en-CA")
      .slice(0, 7);
    return formattedMonth === currentMonth;
  })?.total_refund || 0;

      setTotalRefundToday(todayTotal);
      setTotalRefundMonth(monthTotal);
    } catch (err) {
      console.log("Refund analytics error:", err);
    }
  }, [token, authHeaders]);

  const rescanUpi = async (ticketId) => {
    await API.post(`/tickets/${ticketId}/scan-upi`, {}, { headers: authHeaders() });
    await fetchTickets();
  };

  const updateRefundAmount = async (ticketId, amount) => {
    try {
      await API.post(
        `/tickets/${ticketId}/refund-amount`,
        { refund_amount: amount },
        { headers: authHeaders() }
      );
      alert("Refund amount updated!");
      setEditingRefundId(null);
      setRefundAmountInput("");
      await fetchTickets();
      await fetchRefundAnalytics();
    } catch (err) {
      alert("Failed to update refund amount");
      console.log(err);
    }
  };

  const updatePaytmSetting = async (nextEnabled) => {
    try {
      const res = await API.post(
        "/admin/settings",
        { ...settings, paytm_verification_enabled: nextEnabled },
        { headers: authHeaders() }
      );

      const nextSettings = {
        paytm_verification_enabled: Boolean(res.data?.paytm_verification_enabled),
        auto_close_inactive_tickets: Boolean(res.data?.auto_close_inactive_tickets),
        auto_close_minutes: Number(res.data?.auto_close_minutes) || 5,
        premium_message_mode: Boolean(res.data?.premium_message_mode),
      };

      setSettings(nextSettings);
      setPaytmVerificationEnabled(nextSettings.paytm_verification_enabled);
      alert(`Paytm verification ${nextSettings.paytm_verification_enabled ? "enabled" : "disabled"}`);
    } catch (err) {
      alert("Failed to update Paytm verification setting");
      console.log(err);
    }
  };

  const updateSettingsState = async (nextKey, nextValue) => {
    try {
      const payload = {
        ...settings,
        [nextKey]: nextValue,
      };
      const res = await API.post("/admin/settings", payload, { headers: authHeaders() });
      const nextSettings = {
        paytm_verification_enabled: Boolean(res.data?.paytm_verification_enabled),
        auto_close_inactive_tickets: Boolean(res.data?.auto_close_inactive_tickets),
        auto_close_minutes: Number(res.data?.auto_close_minutes) || 5,
        premium_message_mode: Boolean(res.data?.premium_message_mode),
      };

      setSettings(nextSettings);
      setPaytmVerificationEnabled(nextSettings.paytm_verification_enabled);
    } catch (err) {
      alert("Failed to update bot settings");
      console.log(err);
    }
  };

  const updateTicketDetails = async () => {
    if (!activeChat?.id) return;
    try {
      const res = await API.patch(`/admin/tickets/${activeChat.id}`, ticketDraft, { headers: authHeaders() });
      setActiveChat(res.data.ticket);
      await fetchTickets();
    } catch (err) {
      alert("Failed to update ticket details");
      console.log(err);
    }
  };

  const reopenTicket = async () => {
    if (!activeChat?.id) return;
    try {
      const res = await API.post(`/admin/tickets/${activeChat.id}/reopen`, {}, { headers: authHeaders() });
      setActiveChat(res.data.ticket);
      setMessages([]);
      await fetchTickets();
    } catch (err) {
      alert("Failed to reopen ticket");
      console.log(err);
    }
  };

  const exportTickets = () => {
    const columns = ["id", "phone", "main_issue", "sub_issue", "location", "status", "state", "priority", "assigned_to", "created_at"];
    const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [
      columns.join(","),
      ...filteredTickets.map((ticket) => columns.map((column) => escapeCsv(ticket[column])).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `snackit-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  /* =========================================================================
     EFFECTS
  ========================================================================= */
  useEffect(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [messages, typing]);

  useEffect(() => {
    if (!token) return;
    const loadData = async () => {
      // Only load what this person's pages need; the server refuses the rest anyway.
      const pages = isAdmin ? ALL_PAGE_KEYS : myAccess.pages || [];
      const has = (page) => pages.includes(page);
      await Promise.all([
        fetchInternalData(),
        has("tickets") && fetchTickets(),
        has("products") && fetchProducts(),
        has("operations") && fetchOperationsSummary(),
        has("analytics") && fetchAnalytics(),
        (has("tickets") || has("analytics")) && fetchRefundAnalytics(),
        has("feedback") && fetchFeedback(),
        (has("tickets") || has("settings")) && fetchSettings(),
      ]);
    };
    loadData();
  }, [token, isAdmin, fetchInternalData, (myAccess.pages || []).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  

  useEffect(() => {
    if (!activeChat?.id) return;
    const loadMessages = async () => { await fetchMessages(activeChat.id); };
    loadMessages();
    const interval = setInterval(() => { loadMessages(); }, 2000);
    return () => clearInterval(interval);
  }, [activeChat, fetchMessages]);

  useEffect(() => {
    if (!token) return;

    const socket = io(API.defaults.baseURL, {
      transports: ["websocket"],
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Internal socket connected");
      // Admin has no employee id; direct chats address admin as "admin".
      const userRoom = currentUserId || (isOwner ? "admin" : "");
      if (userRoom) socket.emit("join-internal-user", { userId: userRoom });
    });

    socket.on("internal-chat-updated", ({ chat, notification }) => {
      if (!chat) return;
      setInternalChats((prev) => {
        const exists = prev.some((item) => String(item.id) === String(chat.id));
        const isIncoming = notification && notification.sourceUser !== currentUserName;
        const isSelected = String(selectedInternalChatIdRef.current) === String(chat.id);
        const nextChat = isIncoming && !isSelected ? { ...chat, unread: Number(chat.unread || 0) + 1 } : chat;
        if (exists) {
          return prev.map((item) => (String(item.id) === String(chat.id) ? nextChat : item));
        }
        return [nextChat, ...prev];
      });

      if (notification && notification.sourceUser !== currentUserName) {
        if (document.visibilityState === "visible") playMessageSound();
        triggerInternalNotification(notification.title || "Department update", notification.priority || "medium", notification.message || "New internal update");
      }
    });

    socket.on("internal-chat-deleted", ({ chatId }) => {
      if (!chatId) return;
      setInternalChats((prev) => prev.filter((chat) => String(chat.id) !== String(chatId)));
      setSelectedInternalChatId((prev) => (String(prev) === String(chatId) ? null : prev));
    });

    socket.on("internal-user-updated", ({ removedUserId }) => {
      if (removedUserId) {
        setInternalUsers((prev) => prev.filter((user) => String(user.id) !== String(removedUserId)));
      }
    });

    socket.on("internal-notification", (notification) => {
      if (!notification || notification.sourceUser === currentUserName) return;
      const mentionedCurrentUser = (notification.mentionUserIds || []).map(String).includes(String(currentUserId));
      const selectedCurrentUser = !notification.notifyAll && (notification.recipientIds || []).map(String).includes(String(currentUserId));
      if (mentionedCurrentUser || selectedCurrentUser) playInternalMentionAlert();
      triggerInternalNotification(notification.title || "Department alert", notification.priority || "medium", notification.message || "New internal update");
    });

    return () => {
      socket.off("internal-chat-updated");
      socket.off("internal-chat-deleted");
      socket.off("internal-user-updated");
      socket.off("internal-notification");
      socket.disconnect();
    };
  }, [token, isOwner, currentUserId, currentUserName, playInternalMentionAlert, playMessageSound, triggerInternalNotification]);

  useEffect(() => {
    if (!socketRef.current || !selectedDepartment) return;
    socketRef.current.emit("join-internal-room", { department: selectedDepartment });
  }, [selectedDepartment, token]);

  useEffect(() => {
    if (!activeChat) return;
    setTicketDraft({
      priority: activeChat.priority || "normal",
      assigned_to: activeChat.assigned_to || "",
      admin_notes: activeChat.admin_notes || "",
    });
  }, [activeChat?.id]);

  /* =========================================================================
     ACTIONS
  ========================================================================= */
  const handleAction = async (id, action) => {
    try {
      setLoadingId(id);
      await API.post("/ticket/action", { ticketId: id, action }, { headers: authHeaders() });
      alert(`Action "${action}" completed successfully`);
      await fetchTickets();
    } catch (err) {
      alert("Action failed. Check backend.");
      console.log(err);
    } finally {
      setLoadingId(null);
    }
  };

  const takeover = async () => {
    if (!activeChat) return;
    try {
      const res = await API.post("/admin/takeover", { phone: activeChat.phone, ticketId: activeChat.id }, { headers: authHeaders() });
      if (res.data?.ticket) setActiveChat(res.data.ticket);
      await fetchMessages(activeChat.id);
      fetchTickets();
    } catch (err) {
      alert("Takeover failed");
      console.log(err);
    }
  };

  const release = async () => {
    if (!activeChat) return;
    try {
      const res = await API.post("/admin/release", { phone: activeChat.phone, ticketId: activeChat.id }, { headers: authHeaders() });
      if (res.data?.ticket) setActiveChat(res.data.ticket);
      fetchTickets();
    } catch (err) {
      alert("Release failed");
      console.log(err);
    }
  };


  /* =========================================================================
     FILTERING
  ========================================================================= */
  const filteredTickets = tickets.filter((t) => {
    const s = search.toLowerCase();
    const matchSearch =
      t.phone?.toLowerCase().includes(s) ||
      (t.upi_id || "").toLowerCase().includes(s) ||
      (t.screenshot_upi_id || "").toLowerCase().includes(s) ||
      t.issue?.toLowerCase().includes(s) ||
      t.main_issue?.toLowerCase().includes(s) ||
      t.sub_issue?.toLowerCase().includes(s) ||
      t.location?.toLowerCase().includes(s) ||
      String(t.id).includes(s);

    let matchFilter = true;
    if (filter === "OPEN" || filter === "CLOSED") {
      matchFilter = t.state?.toUpperCase() === filter;
    } else if (filter === "AUTO_CLOSED") {
      matchFilter = t.status === "auto_closed";
    } else if (["low", "normal", "high", "urgent"].includes(filter)) {
      matchFilter = (t.priority || "normal") === filter;
    } else if (filter) {
      matchFilter = t.status === filter;
    }

    return matchSearch && matchFilter;
  });

  /* =========================================================================
     STATS
  ========================================================================= */
  const openCount = tickets.filter((t) => t.state === "OPEN").length;
  const closedCount = tickets.filter((t) => t.state === "CLOSED").length;
  const autoClosedCount = tickets.filter((t) => t.status === "auto_closed").length;
  const adminCount = tickets.filter((t) => t.takeover).length;
  const refundedCount = tickets.filter((t) => t.status === "refunded" || t.status === "auto_refunded").length;

  // Analytics summary stats
  const totalIssues = analyticsCategory.reduce((sum, c) => sum + c.count, 0);
  const topIssue = analyticsCategory.length > 0
    ? analyticsCategory.reduce((a, b) => a.count > b.count ? a : b)
    : null;
  const avgMonthly = analyticsMonthly.length > 0
    ? Math.round(analyticsMonthly.reduce((s, m) => s + m.count, 0) / analyticsMonthly.length)
    : 0;
  const resolvedCount = tickets.filter((t) => ["resolved", "refunded", "auto_refunded"].includes(t.status)).length;
  const closureRate = tickets.length ? Math.round(((resolvedCount + closedCount + autoClosedCount) / tickets.length) * 100) : 0;
  const automationRate = tickets.length ? Math.round((autoClosedCount / tickets.length) * 100) : 0;
  const topIssueLabel = topIssue?.issue?.split(" - ")[0] || "No data yet";
  const latestMonth = analyticsMonthly[analyticsMonthly.length - 1];

  /* =========================================================================
     LOGIN SCREEN
  ========================================================================= */
  if (!token) {
    return (
      <div className="login-page">
       <div className="login-left">
  {/* ✅ CHANGED: From <img> to <video> */}
  <video 
    autoPlay 
    muted 
    loop 
    playsInline
    className="login-bg-video"
  >
    <source src="/login.mp4" type="video/mp4" />
  </video>
  <div className="login-overlay" />
</div>
        <div className="login-right">
          <div className="login-card">
            <div className="login-card-header">
              <div className="login-dot" />
              <span>Admin Portal</span>
            </div>
            <h2>Welcome back</h2>
            <p className="login-sub">Sign in to manage tickets, feedback, and analytics.</p>
            <div className="login-field">
              <label>Username</label>
              <input
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && login()}
              />
            </div>
            <div className="login-field">
              <label>Password</label>
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && login()}
              />
            </div>
            <button className="login-btn" onClick={login} disabled={loginInProgress || !username.trim() || !password}>
              {loginInProgress ? "Signing in…" : "Sign In"}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Recipient-targeted messages are only shown to their recipients, the sender and admins
  const visibleInternalMessages = (chat) => (chat?.messages || []).filter((message) => {
    if (isChatStartedNotice(message)) return false;
    const recipients = (message.recipientIds || []).map(String);
    return isOwner || !recipients.length || recipients.includes(String(currentUserId)) || message.sender === currentUserName;
  });

  const startDirectChat = async (userKey) => {
    try {
      const response = await API.post("/internal/direct", { userKey }, { headers: authHeaders() });
      const chat = response.data?.chat;
      if (!chat) return;
      setInternalChats((prev) => (prev.some((item) => String(item.id) === String(chat.id)) ? prev : [chat, ...prev]));
      setSelectedDepartment("Direct");
      setSelectedInternalChatId(chat.id);
      setMobileChatPane("conversation");
    } catch (err) {
      alert(err.response?.data?.error || "Could not open the chat");
    }
  };

  const createInternalChat = async (title) => {
    try {
      const response = await API.post(
        "/internal/chats",
        { department: selectedDepartment, title, priority: internalPriority, participants: departmentUsers.map((user) => user.name) },
        { headers: authHeaders() }
      );
      const chat = response.data?.chat;
      if (!chat) return null;
      setInternalChats((prev) => [chat, ...prev]);
      setSelectedInternalChatId(chat.id);
      setMobileChatPane("conversation");
      return chat;
    } catch (err) {
      alert(err.response?.data?.error || "Failed to create chat");
      return null;
    }
  };

  const mobileChatProps = {
    openMenu: () => setMobileNavOpen(true),
    departments: availableDepartments,
    selectedDepartment,
    setSelectedDepartment,
    departmentChats,
    chats: visibleDepartmentChats,
    search: internalSearch,
    setSearch: setInternalSearch,
    filter: internalFilter,
    setFilter: setInternalFilter,
    showArchived: showArchivedChats,
    setShowArchived: setShowArchivedChats,
    selectedChat: selectedInternalChat,
    visibleMessages: visibleInternalMessages,
    pane: mobileChatPane,
    setPane: setMobileChatPane,
    openChat: (chatId) => { setSelectedInternalChatId(chatId); markInternalChatRead(chatId); setMobileChatPane("conversation"); },
    createChat: createInternalChat,
    updateChat: updateInternalChat,
    deleteChat: handleDeleteChat,
    updateMessage: updateInternalMessage,
    updateStatus: handleUpdateMessageStatus,
    currentUserName,
    currentUserId,
    isAdmin,
    message: internalMessage,
    setMessage: setInternalMessage,
    send: handleSendInternalMessage,
    priority: internalPriority,
    setPriority: setInternalPriority,
    attachedFiles,
    setAttachedFiles,
    replyTo: internalReplyTo,
    setReplyTo: setInternalReplyTo,
    savedReplies,
    replyDraft: savedReplyDraft,
    setReplyDraft: setSavedReplyDraft,
    saveReply: saveInternalReply,
    recipients: selectedRecipients,
    setRecipients: setSelectedRecipients,
    internalUsers,
    departmentUsers,
    deleteUser: handleDeleteUser,
    newEmployee,
    setNewEmployee,
    addEmployee: handleAddEmployee,
    employeeCredentials,
    chatName: chatDisplayName,
    taggablePeople,
    taggedNames,
    isTaggedMe,
    directPeople,
    startDirect: startDirectChat,
    myChatKey,
    pushState,
    turnOnNotifications,
    openNotifySettings: () => setShowNotifySettings(true),
  };

  /* =========================================================================
     MAIN DASHBOARD
  ========================================================================= */
  return (
    <div className={`dashboard view-${view} ${adminProfile.compactMode ? "dashboard-compact" : ""}`}>

      {/* ── MOBILE TOP BAR (phones only) ────────────────────────────────────── */}
      <header className="mobile-topbar">
        <button type="button" className="mobile-menu-button" aria-label="Open menu" onClick={() => setMobileNavOpen(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <img src={adminProfile.logo} alt="" />
        <span>{adminProfile.displayName || "Snackit"}</span>
      </header>
      {mobileNavOpen && <div className="mobile-nav-backdrop" onClick={() => setMobileNavOpen(false)} />}

      {/* ── SIDEBAR ─────────────────────────────────────────────────────────── */}
      <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <img src={adminProfile.logo} alt="Snackit logo" />
          <span>{adminProfile.displayName || "Snackit"}</span>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Main Menu</div>
          {can("tickets") && <button
            className={`nav-item ${view === "tickets" ? "active" : ""}`}
            onClick={() => setView("tickets")}
          >
            {Icon.ticket}
            <span>Tickets</span>
            {openCount > 0 && <span className="nav-badge">{openCount}</span>}
          </button>}
          {can("feedback") && <button
            className={`nav-item ${view === "feedback" ? "active" : ""}`}
            onClick={() => setView("feedback")}
          >
            {Icon.feedback}
            <span>Feedback</span>
          </button>}
          {can("products") && <button
            className={`nav-item ${view === "products" ? "active" : ""}`}
            onClick={() => setView("products")}
          >
            {Icon.product}
            <span>Products</span>
          </button>}

          {canAccessOperations && <>
            <div className="sidebar-divider" />
            <div className="sidebar-section-label">Operations</div>
            {[['inventory', 'Inventory'], ['clients', 'Clients'], ['brands', 'Brands'], ['performance', 'Product Performance'], ['leads', 'Leads'], ['routes', 'Routes & Demand'], ['demand', 'Demand Analytics'], ['import', 'Bulk Import']].map(([operationView, label]) => (
              <button
                key={operationView}
                className={`nav-item ${view === operationView ? "active" : ""}`}
                onClick={() => setView(operationView)}
              >
                {Icon.analytics}
                <span>{label}</span>
              </button>
            ))}
          </>}

          {(canAccessAudit || can("findings") || can("expiry")) && <>
          <div className="sidebar-divider" />
          <div className="sidebar-section-label">Quality</div>
          </>}
          {canAccessAudit && (
            <button
              className={`nav-item ${view === "audit" ? "active" : ""}`}
              onClick={() => setView("audit")}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" />
              </svg>
              <span>Refill Audit</span>
            </button>
          )}
          {can("findings") && <button
            className={`nav-item ${view === "findings" ? "active" : ""}`}
            onClick={() => setView("findings")}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 3v3h6V3M9 12h6M9 16h4" />
            </svg>
            <span>Internal Audit</span>
          </button>}
          {can("expiry") && <button
            className={`nav-item ${view === "expiry" ? "active" : ""}`}
            onClick={() => setView("expiry")}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M10 14l4 4M14 14l-4 4" />
            </svg>
            <span>Expiry Tracking</span>
          </button>}

          <div className="sidebar-divider" />
          <div className="sidebar-section-label">{can("analytics") ? "Insights" : "Team"}</div>
          {can("analytics") && <button
            className={`nav-item ${view === "analytics" ? "active" : ""}`}
            onClick={() => setView("analytics")}
          >
            {Icon.analytics}
            <span>Analytics</span>
          </button>}
          <button
            className={`nav-item ${view === "internal-chat" ? "active" : ""}`}
            onClick={() => setView("internal-chat")}
          >
            {Icon.chat}
            <span>Internal Chat</span>
          </button>
          {isAdmin && <button
            className={`nav-item ${view === "employees" ? "active" : ""}`}
            onClick={() => setView("employees")}
          >
            {Icon.chat}
            <span>Employees & Access</span>
          </button>}
          {can("activity") && <button
            className={`nav-item ${view === "activity" ? "active" : ""}`}
            onClick={() => setView("activity")}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>
            <span>Activity Log</span>
          </button>}
          {isAdmin && <button
            className={`nav-item ${view === "admin-settings" ? "active" : ""}`}
            onClick={() => setView("admin-settings")}
          >
            {Icon.settings}
            <span>Admin Settings</span>
          </button>}
          <button className="nav-item" onClick={() => { setShowAccount(true); setMobileNavOpen(false); }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></svg>
            <span>My Account</span>
            <span className="nav-role-chip">{myAccess.roleLabel || (isOwner ? "Owner" : "Staff")}</span>
          </button>
          <button className="nav-item" onClick={() => { setShowNotifySettings(true); setMobileNavOpen(false); }}>
            {Icon.bell}
            <span>Notifications</span>
            <span className={`nav-notify-state nav-notify-${pushState}`}>{PUSH_STATE_LABELS[pushState] || "Off"}</span>
          </button>
        </nav>

        <button className="sidebar-logout" onClick={logout}>
          {Icon.logout}
          <span>Logout</span>
        </button>
      </aside>

      {showAccount && (
        <AccountPanel api={API} headers={authHeaders()} name={currentUserName} username={isOwner ? "" : currentUsername} access={myAccess} isOwner={isOwner} onClose={() => setShowAccount(false)} />
      )}

      {showNotifySettings && (
        <NotificationSettings
          state={pushState}
          busy={notifyBusy}
          onTurnOn={turnOnNotifications}
          onCheckAgain={recheckNotifications}
          onTest={sendTestNotification}
          soundOn={chatSoundOn}
          onToggleSound={toggleChatSound}
          onClose={() => setShowNotifySettings(false)}
        />
      )}

      {/* ── MAIN CONTENT ────────────────────────────────────────────────────── */}
      <main className={`main-content ${activeChat ? "chat-open" : ""} ${view === "internal-chat" && !isMobile ? "is-chat-view" : ""}`}>

        {myAccess.readOnly && <div className="readonly-banner">👀 View-only access: you can look around, but changes are turned off for your account.</div>}

        {/* ── PAGE HEADER ─────────────────────────────────────────────────── */}
        <div className="page-header">
          <div className="page-title">
            <h1>
              {view === "tickets" && "Support Tickets"}
              {view === "feedback" && "Customer Feedback"}
              {view === "products" && "Product Leads"}
              {view === "inventory" && "Machine Inventory"}
              {view === "clients" && "Host-site CRM"}
              {view === "brands" && "Brand & SKU Performance"}
              {view === "performance" && "Product Performance"}
              {view === "leads" && "Sales Pipeline"}
              {view === "routes" && "Routes & Demand"}
              {view === "demand" && "Demand Analytics"}
              {view === "import" && "Bulk Imports"}
              {view === "audit" && "Refill Audit"}
              {view === "findings" && "Internal Audit"}
              {view === "expiry" && "Expiry Tracking"}
              {view === "analytics" && "Analytics"}
              {view === "internal-chat" && "Internal Chat"}
              {view === "employees" && "Employees & Access"}
              {view === "activity" && "Activity Log"}
              {view === "admin-settings" && "Admin Settings"}
            </h1>
            <p className="page-sub">
              {view === "tickets" && `${filteredTickets.length} tickets · ${openCount} open`}
              {view === "feedback" && `${feedback.length} responses collected`}
              {view === "products" && `${products.length} product leads`}
              {view === "inventory" && "Stock health, velocity, and restock intelligence"}
              {view === "clients" && "Contracts, renewals, and relationship history"}
              {view === "brands" && "Sell-through, revenue, and SKU performance"}
              {view === "performance" && "Cross-brand leaderboard by city and sector"}
              {view === "leads" && "Move enquiries from first contact to closed"}
              {view === "routes" && "Demand signals and today's suggested refill route"}
              {view === "demand" && "Hourly demand and sector comparison"}
              {view === "import" && "Upload and audit machines, slots, clients, brands, and SKUs"}
              {view === "audit" && "Machine quality checks, refillers, sites and corrective actions"}
              {view === "findings" && "Audit findings, corrective actions, owners and follow-ups"}
              {view === "expiry" && "Batch expiry dates, expired stock and write-off value"}
              {view === "analytics" && "Issue breakdown and trends"}
              {view === "internal-chat" && `${departmentChats.length} active ${selectedDepartment} conversations`}
              {view === "employees" && `${internalUsers.length} people with their own login`}
              {view === "activity" && "Who changed what, and when"}
              {view === "admin-settings" && "Profile, branding, and workspace preferences"}
            </p>
          </div>
          <div className="page-live">
            <span className="live-dot" />
            <span className="live-text">Live</span>
          </div>
        </div>

        {view === "employees" && isAdmin && (
          <EmployeesAccess api={API} headers={authHeaders()} departments={departments} currentUserId={currentUserId} onChanged={fetchInternalData} />
        )}

        {view === "activity" && can("activity") && <ActivityLog api={API} headers={authHeaders()} />}

        {view === "admin-settings" && isAdmin && (
          <section className="admin-settings-page">
            <div className="admin-settings-hero">
              <div>
                <span className="employee-eyebrow">Admin workspace</span>
                <h2>Make Snackit feel like your workspace</h2>
                <p>Update the admin profile, replace the logo, and tune the dashboard for your team.</p>
              </div>
              <div className="admin-settings-avatar">
                <img src={adminProfile.logo} alt="Current Snackit logo" />
              </div>
            </div>

            <div className="admin-settings-grid">
              <div className="admin-settings-card">
                <div className="admin-settings-card-heading">
                  <div>
                    <h3>Snackit profile</h3>
                    <p>This name appears in the dashboard sidebar and internal messages.</p>
                  </div>
                </div>
                <label className="admin-setting-field">
                  <span>Display name</span>
                  <input
                    value={adminProfile.displayName}
                    onChange={(event) => setAdminProfile((profile) => ({ ...profile, displayName: event.target.value }))}
                    placeholder="Snackit Admin"
                  />
                </label>
                <label className="admin-setting-field">
                  <span>Admin email</span>
                  <input
                    type="email"
                    value={adminProfile.email}
                    onChange={(event) => setAdminProfile((profile) => ({ ...profile, email: event.target.value }))}
                    placeholder="admin@snackit.com"
                  />
                </label>
              </div>

              <div className="admin-settings-card">
                <div className="admin-settings-card-heading">
                  <div>
                    <h3>Branding</h3>
                    <p>Use your own logo throughout this browser's Snackit dashboard.</p>
                  </div>
                </div>
                <label className="logo-upload">
                  <img src={adminProfile.logo} alt="Logo preview" />
                  <span>
                    <strong>Change logo</strong>
                    <small>PNG, JPG, or SVG up to 2 MB</small>
                  </span>
                  <input type="file" accept="image/*" onChange={handleAdminLogoChange} />
                </label>
              </div>

              <div className="admin-settings-card admin-settings-preferences">
                <div className="admin-settings-card-heading">
                  <div>
                    <h3>Workspace preferences</h3>
                    <p>Keep the dashboard comfortable for long support sessions.</p>
                  </div>
                </div>
                <label className="admin-preference-row">
                  <span>
                    <strong>Compact dashboard</strong>
                    <small>Use tighter spacing in tables and internal chat.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={adminProfile.compactMode}
                    onChange={(event) => setAdminProfile((profile) => ({ ...profile, compactMode: event.target.checked }))}
                  />
                </label>
              </div>
            </div>
            <button type="button" className="admin-settings-save" onClick={saveAdminProfile}>Save admin settings</button>
          </section>
        )}

        {["inventory", "clients", "brands", "performance", "leads", "routes", "demand", "import"].includes(view) && canAccessOperations && (
          <OperationsWorkspace token={token} internalUsers={internalUsers} workspace={view} />
        )}

        {view === "expiry" && <ExpiryWorkspace token={token} isAdmin={isAdmin} />}

        {view === "findings" && (
          <FindingsWorkspace
            token={token}
            isAdmin={isAdmin}
            currentUserName={currentUserName}
            currentUserId={currentUserId}
            internalUsers={internalUsers}
            departments={departments}
          />
        )}

        {view === "audit" && canAccessAudit && (
          <AuditWorkspace token={token} currentUserName={currentUserName} isAdmin={isAdmin} />
        )}

        {view === "internal-chat" && isMobile && (
          <MobileChat chat={mobileChatProps} />
        )}

        {view === "internal-chat" && !isMobile && (
          <div className="internal-chat-shell">
            <div className={`wd-layout ${showTeamPanel ? "" : "team-hidden"} ${teamOverlayOpen ? "team-overlay-open" : ""}`}>
              <aside className="wd-sidebar">
                <div className="wd-side-head">
                  <h2>Chats</h2>
                  {["off", "denied"].includes(pushState) && <button type="button" className="wd-notify-btn" onClick={() => setShowNotifySettings(true)}>🔔 {pushState === "denied" ? "Notifications blocked" : "Turn on notifications"}</button>}
                </div>
                <div className="wd-departments">
                  {availableDepartments.map((department) => (
                    <button key={department} type="button" className={selectedDepartment === department ? "active" : ""} onClick={() => setSelectedDepartment(department)}>
                      {department === "Direct" ? "💬 Direct" : department}
                    </button>
                  ))}
                </div>
                <div className="wd-search">
                  {Icon.search}
                  <input value={internalSearch} onChange={(event) => setInternalSearch(event.target.value)} placeholder="Search chats" />
                </div>
                <div className="wd-filters">
                  {[["all", "All"], ["unread", "Unread"], ["pinned", "Pinned"], ["favorites", "Favorites"]].map(([value, label]) => (
                    <button key={value} type="button" className={internalFilter === value ? "active" : ""} onClick={() => setInternalFilter(value)}>{label}</button>
                  ))}
                  <button type="button" className={showArchivedChats ? "active" : ""} onClick={() => setShowArchivedChats((value) => !value)}>Archived</button>
                </div>
                <div className="wd-chat-list">
                  {visibleDepartmentChats.length ? visibleDepartmentChats.map((chat) => {
                    const last = visibleInternalMessages(chat).at(-1);
                    const name = chatDisplayName(chat);
                    const preview = last ? `${last.sender === currentUserName ? "You" : last.sender}: ${last.text || "📎 Attachment"}` : "No messages yet";
                    return (
                      <div key={chat.id} className={`wd-chat-row ${selectedInternalChat?.id === chat.id ? "selected" : ""}`}>
                        <button type="button" className="wd-chat-main" onClick={() => { setSelectedInternalChatId(chat.id); markInternalChatRead(chat.id); }}>
                          <Avatar name={name} size={44} />
                          <span className="wd-chat-text">
                            <span className="wd-chat-top"><b>{name}</b><small className={chat.unread ? "unread" : ""}>{last?.time || ""}</small></span>
                            <span className="wd-chat-bottom">
                              <span>{preview}</span>
                              <span className="wd-chat-icons">{chat.pinned ? "📌" : ""}{chat.favorite ? "★" : ""}{chat.archived ? "🗄" : ""}{chat.unread ? <b>{chat.unread}</b> : ""}</span>
                            </span>
                          </span>
                        </button>
                        <div className="wd-chat-actions">
                          <button type="button" title={chat.pinned ? "Unpin" : "Pin"} onClick={() => updateInternalChat(chat.id, { pinned: !chat.pinned })}>📌</button>
                          <button type="button" title={chat.favorite ? "Remove favorite" : "Favorite"} onClick={() => updateInternalChat(chat.id, { favorite: !chat.favorite })}>{chat.favorite ? "★" : "☆"}</button>
                          <button type="button" title={chat.archived ? "Restore" : "Archive"} onClick={() => updateInternalChat(chat.id, { archived: !chat.archived })}>🗄</button>
                          {isAdmin && chat.type !== "direct" && <button type="button" title="Rename" onClick={() => updateInternalChat(chat.id, { title: window.prompt("Chat name", chat.title) || chat.title })}>✏️</button>}
                          {isAdmin && <button type="button" title="Delete chat" className="danger" onClick={() => handleDeleteChat(chat.id)}>🗑</button>}
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="wd-empty-list">{selectedDepartment === "Direct" ? "No direct chats yet. Pick a person on the right to start one." : "No chats match these filters."}</div>
                  )}
                </div>
              </aside>

              <section className="wd-conversation">
                <header className="wd-chat-head">
                  <Avatar name={selectedInternalChat ? chatDisplayName(selectedInternalChat) : selectedDepartment} size={40} />
                  <div className="wd-chat-title">
                    <h3>{selectedInternalChat ? chatDisplayName(selectedInternalChat) : selectedDepartment === "Direct" ? "Direct messages" : `${selectedDepartment} chat`}</h3>
                    <p>{selectedDepartment === "Direct" ? "🔒 Private · only the two of you can see these messages" : `Everyone is in this group · type @ to tag ${selectedDepartment} people (${departmentUsers.length})`}</p>
                  </div>
                  <div className="wd-head-actions">
                    {selectedInternalChat && <>
                      <select value={selectedInternalChat.priority || "medium"} onChange={(event) => updateInternalChat(selectedInternalChat.id, { priority: event.target.value })} aria-label="Chat priority">
                        <option value="low">🟢 Low priority</option>
                        <option value="medium">🟡 Medium priority</option>
                        <option value="urgent">🔴 Urgent priority</option>
                      </select>
                      <button type="button" onClick={() => updateInternalChat(selectedInternalChat.id, { archived: !selectedInternalChat.archived })}>{selectedInternalChat.archived ? "Restore" : "Archive"}</button>
                    </>}
                    <button type="button" className={`wd-team-toggle ${showTeamPanel ? "active" : ""} ${teamOverlayOpen ? "overlay-active" : ""}`} onClick={toggleTeamPanel} title={showTeamPanel ? "Hide team" : "Show team"}>👥 Team</button>
                  </div>
                </header>

                <div className="internal-messages dm-list wd-messages" ref={desktopMessagesRef}>
                  {selectedInternalChat && visibleInternalMessages(selectedInternalChat).length ? (
                    visibleInternalMessages(selectedInternalChat).map((message) => {
                      const outgoing = message.sender === currentUserName || (currentUserName === "Admin" && message.sender === "You");
                      const quoted = message.replyTo ? selectedInternalChat.messages.find((item) => String(item.id) === String(message.replyTo)) : null;
                      const reactions = Object.entries(message.reactions || {}).filter(([, people]) => people?.length);
                      const tagged = taggedNames(message);
                      return (
                        <div key={message.id} className={`dm-row ${outgoing ? "out" : "in"}`}>
                          <div className={`dm-bubble ${message.priority === "urgent" ? "is-urgent" : ""}`}>
                            <div className="dm-actions">
                              {[["👍", "thumbs"], ["✅", "done"], ["⚠️", "alert"]].map(([reaction, key]) => (
                                <button type="button" key={key} title="React" onClick={() => updateInternalMessage(selectedInternalChat.id, message.id, { reaction })}>{reaction}</button>
                              ))}
                              <button type="button" onClick={() => { setInternalReplyTo(message); deskInputRef.current?.focus(); }}>Reply</button>
                            </div>
                            {!outgoing && <div className="dm-sender">{message.sender}</div>}
                            {message.replyTo && (
                              <div className="dm-quote">
                                <b>{quoted?.sender || "Earlier message"}</b>
                                <span>{quoted?.text || "Original message"}</span>
                              </div>
                            )}
                            {message.priority === "urgent" && <span className="dm-urgent">Urgent</span>}
                            {message.attachments?.length ? (
                              <div className="dm-attachments">
                                {message.attachments.map((file, idx) => (
                                  <div key={`${file.name}-${idx}`}>
                                    {file.type?.startsWith("image/") && file.dataUrl ? <img className="dm-image" src={file.dataUrl} alt={file.name} /> : null}
                                    {file.dataUrl ? <a className="dm-file" href={file.dataUrl} download={file.name}>📎 {file.name}</a> : <span className="dm-file">📎 {file.name}</span>}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            <span className="dm-text"><MentionText text={message.text} names={tagged} /></span>
                            <span className="dm-meta">
                              {message.time}
                              {outgoing && <span className="dm-ticks">✓✓</span>}
                            </span>
                            {tagged.length > 0 && (
                              <TaskLine
                                message={message}
                                taggedNames={tagged}
                                canUpdate={isTaggedMe(message)}
                                onSetStatus={(value) => handleUpdateMessageStatus(selectedInternalChat.id, message.id, value)}
                              />
                            )}
                            {reactions.length > 0 && (
                              <div className="dm-reactions">
                                {reactions.map(([reaction, people]) => <span key={reaction} title={people.join(", ")}>{reaction}{people.length > 1 ? ` ${people.length}` : ""}</span>)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="dm-empty">No messages yet. Say hello to the {selectedDepartment === "Direct" ? "team" : `${selectedDepartment} team`} 👋</div>
                  )}
                </div>

                {selectedDepartment === "Direct" && !selectedInternalChat ? (
                  <div className="wd-composer wd-composer-hint">Pick a person in the list on the right to start a private chat.</div>
                ) : (
                <div
                  className="wd-composer"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    setAttachedFiles((files) => [...files, ...Array.from(event.dataTransfer.files || [])]);
                  }}
                >
                  {internalReplyTo && <div className="wd-reply-banner"><span><b>Replying to {internalReplyTo.sender}</b>{internalReplyTo.text}</span><button type="button" onClick={() => setInternalReplyTo(null)} aria-label="Cancel reply">✕</button></div>}
                  {attachedFiles.length > 0 && (
                    <div className="wd-attachments">
                      {attachedFiles.map((file, index) => (
                        <span key={`${file.name}-${index}`}>
                          📎 {file.name}
                          <button
                            type="button"
                            aria-label={`Remove ${file.name}`}
                            onClick={() => {
                              setAttachedFiles((files) => files.filter((_, fileIndex) => fileIndex !== index));
                              if (attachmentInputRef.current && attachedFiles.length === 1) attachmentInputRef.current.value = "";
                            }}
                          >✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="wd-tools">
                    <div className="wd-priority">
                      {[["low", "Low", "green"], ["medium", "Medium", "yellow"], ["urgent", "Urgent", "red"]].map(([value, label, tone]) => (
                        <button type="button" key={value} className={`${tone} ${internalPriority === value ? "selected" : ""}`} onClick={() => setInternalPriority(value)}><i />{label}</button>
                      ))}
                    </div>
                    <select value="" onChange={(event) => { const reply = savedReplies.find((item) => item.id === event.target.value); if (reply) setInternalMessage((value) => `${value}${value ? " " : ""}${reply.text}`); }} aria-label="Insert saved reply">
                      <option value="">⚡ Saved replies</option>
                      {savedReplies.map((reply) => <option key={reply.id} value={reply.id}>{reply.title}</option>)}
                    </select>
                    <button type="button" className="wd-link" onClick={() => setShowSavedReplyForm((value) => !value)}>{showSavedReplyForm ? "Close" : "+ Save reply"}</button>
                  </div>
                  {showSavedReplyForm && <form className="wd-saved-form" onSubmit={saveInternalReply}>
                    <input placeholder="Reply title" value={savedReplyDraft.title} onChange={(event) => setSavedReplyDraft((draft) => ({ ...draft, title: event.target.value }))} />
                    <input placeholder="Reply text" value={savedReplyDraft.text} onChange={(event) => setSavedReplyDraft((draft) => ({ ...draft, text: event.target.value }))} />
                    <button type="submit">Save</button>
                  </form>}
                  <div className="wd-input-row">
                    <label className="wd-icon-btn" title="Attach file">
                      <input
                        ref={attachmentInputRef}
                        type="file"
                        multiple
                        hidden
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                        onChange={(event) => setAttachedFiles((files) => [...files, ...Array.from(event.target.files || [])])}
                      />
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.4 11.1l-9.2 9.2a6 6 0 01-8.5-8.5l9.2-9.2a4 4 0 015.7 5.7l-9.2 9.2a2 2 0 01-2.8-2.8l8.5-8.5" /></svg>
                    </label>
                    {selectedDepartment !== "Direct" && <button type="button" className="wd-icon-btn wd-at" title={`Tag someone from ${selectedDepartment}`} onClick={deskMention.openPicker}>@</button>}
                    <div className="mention-input-wrap wd-input">
                      {deskMention.open && <MentionSuggestions people={deskMention.suggestions} department={selectedDepartment} onPick={deskMention.pick} />}
                      <input
                        ref={deskInputRef}
                        type="text"
                        value={internalMessage}
                        onChange={deskMention.onChange}
                        onKeyDown={deskMention.onKeyDown}
                        onBlur={() => setTimeout(deskMention.close, 150)}
                        placeholder={selectedDepartment === "Direct" ? "Type a message" : `Type a message · @ to tag ${selectedDepartment}`}
                      />
                    </div>
                    <button className="wd-send" type="button" onClick={handleSendInternalMessage} title="Send" aria-label="Send">{Icon.send}</button>
                  </div>
                </div>
                )}
              </section>

              <aside className="wd-team">
                <div className="wd-team-head">
                  <h3>{selectedDepartment === "Direct" ? "Start a chat" : "Team"}</h3>
                  <span>{selectedDepartment === "Direct" ? directPeople.length : internalUsers.length + 1} people</span>
                  <button type="button" className="wd-close" onClick={toggleTeamPanel} aria-label="Hide team">✕</button>
                </div>
                <div className="wd-search wd-team-search">
                  {Icon.search}
                  <input value={teamSearch} onChange={(event) => setTeamSearch(event.target.value)} placeholder="Search people" />
                </div>
                <div className="wd-team-body">
                  {selectedDepartment === "Direct" ? (
                    <div className="wd-people">
                      {directPeople.filter((person) => matchesTeamSearch(person.name, person.role)).map((person) => (
                        <button type="button" key={person.key} className="wd-person is-clickable" onClick={() => startDirectChat(person.key)}>
                          <Avatar name={person.name} size={38} />
                          <span className="wd-person-text"><b>{person.name}</b><small>{person.role}</small></span>
                          <span className="wd-person-msg" aria-hidden="true">{Icon.chat}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="wd-team-subhead"><span>{selectedDepartment}</span><small>can be tagged here · {departmentUsers.length}</small></div>
                      <div className="wd-people">
                        {departmentUsers.filter((user) => matchesTeamSearch(user.name, user.role)).map((user) => (
                          <div key={user.id} className="wd-person">
                            <Avatar name={user.name} size={38} />
                            <span className="wd-person-text">
                              <b>{user.name}{String(user.id) === myChatKey ? " (you)" : ""}</b>
                              <small>{user.role}{(user.tags || []).length ? ` · ${(user.tags || []).map((tag) => `#${tag}`).join(" ")}` : ""}</small>
                            </span>
                            {String(user.id) !== myChatKey && <button type="button" className="wd-person-msg" title={`Message ${user.name}`} onClick={() => startDirectChat(String(user.id))}>{Icon.chat}</button>}
                            {isAdmin && <button type="button" className="wd-person-del" title={`Delete ${user.name}`} onClick={() => handleDeleteUser(user.id)}>🗑</button>}
                          </div>
                        ))}
                        {!departmentUsers.length && <div className="wd-empty-list">No team members in {selectedDepartment} yet.</div>}
                      </div>
                      {departments.filter((department) => department !== selectedDepartment).map((department) => {
                        const people = internalUsers.filter((user) => user.department === department && matchesTeamSearch(user.name, user.role));
                        if (!people.length) return null;
                        return (
                          <div key={department}>
                            <div className="wd-team-subhead"><span>{department}</span><small>{people.length}</small></div>
                            <div className="wd-people">
                              {people.map((user) => (
                                <div key={user.id} className="wd-person">
                                  <Avatar name={user.name} size={38} />
                                  <span className="wd-person-text"><b>{user.name}{String(user.id) === myChatKey ? " (you)" : ""}</b><small>{user.role}</small></span>
                                  {String(user.id) !== myChatKey && <button type="button" className="wd-person-msg" title={`Message ${user.name}`} onClick={() => startDirectChat(String(user.id))}>{Icon.chat}</button>}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}

                  {isAdmin && (
                    <details className="wd-add-employee">
                      <summary>+ Add employee</summary>
                      <form className="internal-add-user" onSubmit={handleAddEmployee}>
                        <input
                          type="text"
                          placeholder="Employee name"
                          value={newEmployee.name}
                          onChange={(event) => setNewEmployee((prev) => ({ ...prev, name: event.target.value }))}
                        />
                        <select
                          value={newEmployee.department}
                          onChange={(event) => setNewEmployee((prev) => ({ ...prev, department: event.target.value }))}
                        >
                          {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                        </select>
                        <input
                          type="text"
                          placeholder="Role"
                          value={newEmployee.role}
                          onChange={(event) => setNewEmployee((prev) => ({ ...prev, role: event.target.value }))}
                        />
                        <input
                          type="text"
                          placeholder="Tags, comma separated"
                          value={newEmployee.tags}
                          onChange={(event) => setNewEmployee((prev) => ({ ...prev, tags: event.target.value }))}
                        />
                        <button type="submit">Add employee</button>
                      </form>
                      {employeeCredentials && (
                        <div className="employee-credentials">
                          <strong>Login created</strong>
                          <span>Username: <b>{employeeCredentials.username}</b></span>
                          <span>Password: <b>{employeeCredentials.password}</b></span>
                          <small>Share these details securely. The password is shown once.</small>
                        </div>
                      )}
                    </details>
                  )}
                </div>
              </aside>
            </div>

            {notificationToast && (
              <div className="internal-toast">
                <div className="toast-header">
                  <span className={`priority-badge priority-${notificationToast.priority || "medium"}`}>{notificationToast.priority || "medium"}</span>
                  <strong>{notificationToast.title}</strong>
                </div>
                <div>{notificationToast.message}</div>
              </div>
            )}
          </div>
        )}

        {/* ── STAT CARDS (only on tickets) ────────────────────────────────── */}
        {view === "tickets" && (
          <div className="stat-cards">
            <div className="stat-card">
              <div className="stat-icon red"><span>🔴</span></div>
              <div>
                <div className="stat-num">{openCount}</div>
                <div className="stat-label">Open Tickets</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon green"><span>✅</span></div>
              <div>
                <div className="stat-num">{closedCount}</div>
                <div className="stat-label">Closed</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon orange"><span>⏱️</span></div>
              <div>
                <div className="stat-num">{autoClosedCount}</div>
                <div className="stat-label">Auto Closed</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon amber"><span>👤</span></div>
              <div>
                <div className="stat-num">{adminCount}</div>
                <div className="stat-label">Admin Mode</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon blue"><span>💸</span></div>
              <div>
                <div className="stat-num">{refundedCount}</div>
                <div className="stat-label">Refunded</div>
              </div>
            </div>
          </div>
        )}

        {/* ── TICKETS VIEW ────────────────────────────────────────────────── */}
        {view === "tickets" && (
          <>
            <div className="toolbar">
              <div className="search-box">
                {Icon.search}
                <input
                  placeholder="Search by phone, issue, location..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select className="filter-select" onChange={(e) => setFilter(e.target.value)}>
                <option value="">All Status</option>
                <option value="OPEN">Open</option>
                <option value="CLOSED">Closed</option>
                <option value="AUTO_CLOSED">Auto Closed</option>
                <option value="refunded">Refunded</option>
                <option value="auto_refunded">Auto Refunded</option>
                <option value="resolved">Resolved</option>
                <option value="urgent">Urgent priority</option>
                <option value="high">High priority</option>
                <option value="normal">Normal priority</option>
                <option value="low">Low priority</option>
              </select>
              {can("settings") && <button
                type="button"
                className="settings-trigger"
                onClick={() => setShowSettings((prev) => !prev)}
              >
                Bot Settings
              </button>}
              {can("settings") && <button
                type="button"
                className={`paytm-toggle ${paytmVerificationEnabled ? "paytm-toggle-on" : ""}`}
                onClick={() => updatePaytmSetting(!paytmVerificationEnabled)}
                title="Toggle Paytm verification"
              >
                <span className="paytm-toggle-dot" />
                <span>{paytmVerificationEnabled ? "Paytm ON" : "Paytm OFF"}</span>
              </button>}
              <button className="btn-icon" onClick={fetchTickets} title="Refresh">
                {Icon.refresh}
                Refresh
              </button>
              <button className="btn-icon export-btn" onClick={exportTickets} title="Export tickets">
                Export CSV
              </button>
            </div>

            {showSettings && can("settings") && (
              <div className="settings-panel">
                <div className="setting-group">
                  <div className="setting-row">
                    <div>
                      <div className="setting-title">Paytm verification</div>
                      <div className="setting-desc">Require payment validation before ticket submission.</div>
                    </div>
                    <button
                      type="button"
                      className={`mini-toggle ${settings.paytm_verification_enabled ? "mini-toggle-on" : ""}`}
                      onClick={() => updateSettingsState("paytm_verification_enabled", !settings.paytm_verification_enabled)}
                    >
                      <span className="mini-toggle-thumb" />
                    </button>
                  </div>

                  <div className="setting-row">
                    <div>
                      <div className="setting-title">Auto-close inactive tickets</div>
                      <div className="setting-desc">Close tickets automatically if there is no customer reply.</div>
                    </div>
                    <button
                      type="button"
                      className={`mini-toggle ${settings.auto_close_inactive_tickets ? "mini-toggle-on" : ""}`}
                      onClick={() => updateSettingsState("auto_close_inactive_tickets", !settings.auto_close_inactive_tickets)}
                    >
                      <span className="mini-toggle-thumb" />
                    </button>
                  </div>

                  <div className="setting-row setting-row-input">
                    <div>
                      <div className="setting-title">Auto-close after</div>
                      <div className="setting-desc">Choose how long an inactive ticket stays open.</div>
                    </div>
                    <div className="setting-number-control">
                      <input
                        type="number"
                        min="1"
                        max="1440"
                        value={settings.auto_close_minutes}
                        onChange={(e) => setSettings((prev) => ({ ...prev, auto_close_minutes: e.target.value }))}
                        onBlur={() => updateSettingsState("auto_close_minutes", Number(settings.auto_close_minutes))}
                      />
                      <span>minutes</span>
                    </div>
                  </div>

                  <div className="setting-row">
                    <div>
                      <div className="setting-title">Premium message mode</div>
                      <div className="setting-desc">Keep WhatsApp replies cleaner and more premium with minimal symbols.</div>
                    </div>
                    <button
                      type="button"
                      className={`mini-toggle ${settings.premium_message_mode ? "mini-toggle-on" : ""}`}
                      onClick={() => updateSettingsState("premium_message_mode", !settings.premium_message_mode)}
                    >
                      <span className="mini-toggle-thumb" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="table-wrapper tickets-table">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Phone</th>
                    <th>Issue</th>
                    <th>Sub Issue</th>
                    <th>Location</th>
                    <th>UPI ID</th>
                    <th>Image</th>
                    <th>UPI Screenshot</th>
                    <th>Refund Amount</th>
                    <th>Status</th>
                    <th>State</th>
                    <th>Mode</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((t, i) => {
                    const isClosed = t.state === "CLOSED";
                    const isAutoClosed = t.status === "auto_closed";
                    return (
                      <tr key={t.id} className={`ticket-row ${isAutoClosed ? "row-auto-closed" : isClosed ? "row-closed" : ""}`}>
                        <td className="cell-num"><span className="row-num">{i + 1}</span></td>
                        <td className="cell-phone"><span className="phone-tag">{t.phone}</span></td>
                        <td data-label="Issue">{t.main_issue || <span className="na">—</span>}</td>
                        <td data-label="Sub issue">{t.sub_issue || <span className="na">—</span>}</td>
                        <td data-label="Location">{t.location || <span className="na">—</span>}</td>
                        <td data-label="UPI ID"><UpiIdCell ticket={t} /></td>
                        <td data-label="Image">
                          {t.image ? (
                            <img src={t.image} alt="img" className="thumb" onClick={() => window.open(t.image, "_blank")} />
                          ) : <span className="na">—</span>}
                        </td>
                        <td data-label="UPI screenshot">
                          {t.upi_image ? (
                            <div className="upi-scan-cell">
                              <img src={t.upi_image} alt="upi" className="thumb" onClick={() => window.open(t.upi_image, "_blank")} />
                              <UpiScanSummary ticket={t} onOpen={() => setUpiScanTicketId(t.id)} />
                            </div>
                          ) : <span className="na">—</span>}
                        </td>
                        <td data-label="Refund">
  {editingRefundId === t.id ? (
    <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
      <input
        type="number"
        value={refundAmountInput}
        onChange={(e) => setRefundAmountInput(e.target.value)}
        placeholder="Amount"
        style={{
          padding: "5px",
          borderRadius: "5px",
          border: "1px solid #e2e6ef",
          width: "80px",
          fontSize: "12px",
        }}
      />
      <button
        onClick={() => updateRefundAmount(t.id, refundAmountInput)}
        style={{
          padding: "4px 10px",
          background: "#10b981",
          color: "#fff",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer",
          fontSize: "11px",
          fontWeight: "600",
        }}
      >
        Save
      </button>
      <button
        onClick={() => setEditingRefundId(null)}
        style={{
          padding: "4px 10px",
          background: "#8c96ae",
          color: "#fff",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer",
          fontSize: "11px",
        }}
      >
        Cancel
      </button>
    </div>
  ) : (
    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      <span style={{ fontWeight: "600", color: "#0b0f1a" }}>
        ₹{t.refund_amount || "0"}
      </span>
      <button
        onClick={() => {
          setEditingRefundId(t.id);
          setRefundAmountInput(t.refund_amount || "");
        }}
        style={{
          padding: "3px 8px",
          background: "#e8192c",
          color: "#fff",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer",
          fontSize: "10px",
          fontWeight: "600",
        }}
      >
        Edit
      </button>
    </div>
  )}
</td>
                        <td data-label="Status">
                          <span className={`status-badge status-${(t.status || "").replace("_", "-")}`}>
                            {t.status === "auto_closed" ? "Auto Closed" : t.status || "—"}
                          </span>
                          <span className={`priority-badge priority-${t.priority || "normal"}`}>
                            {t.priority || "normal"}
                          </span>
                        </td>
                        <td data-label="State">
                          <span className={`state-pill ${t.state === "OPEN" ? "state-open" : "state-closed"}`}>
                            {isAutoClosed ? "AUTO CLOSED" : t.state}
                          </span>
                        </td>
                        <td data-label="Mode">
                          <span className={`mode-pill ${t.takeover ? "mode-admin" : "mode-bot"}`}>
                            {t.takeover ? "👤 Admin" : "🤖 Bot"}
                          </span>
                        </td>
                        <td className="date-cell" data-label="Date">
                          {t.created_at ? new Date(t.created_at).toLocaleString() : "—"}
                        </td>
                        <td className="cell-actions">
                          <div className="action-group">
                            {["REFUNDED", "AUTO_REFUNDED", "RESOLVED", "CLOSED"].map((action) => (
                              <button
                                key={action}
                                className="action-pill"
                                onClick={() => handleAction(t.id, action)}
                                disabled={loadingId === t.id}
                              >
                                {loadingId === t.id ? "…" : action.replace("_", " ")}
                              </button>
                            ))}
                            <button
                              className="action-pill chat-pill"
                              onClick={() => { setActiveChat(t); setMessages([]); }}
                            >
                              {Icon.chat} Chat
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {view === "tickets" && canAccessOperations && (
          <div className="ops-home-widgets">
            <section className="ops-home-widget">
              <div className="ops-home-widget-heading"><div><span className="ops-eyebrow">Inventory</span><h3>Low stock queue</h3></div><button onClick={() => setView("inventory")}>Open inventory</button></div>
              {lowStockSummary.length ? lowStockSummary.map((slot) => <div className="ops-home-row" key={slot.slot_id}><span><strong>{slot.machine_name}</strong><small>{slot.sku_name || `Slot ${slot.slot_number}`}</small></span><b>{slot.stockout_days == null ? "-" : `${Number(slot.stockout_days).toFixed(1)}d`}</b></div>) : <p className="ops-home-empty">No urgent restocks right now.</p>}
            </section>
            <section className="ops-home-widget">
              <div className="ops-home-widget-heading"><div><span className="ops-eyebrow">Client health</span><h3>Renewals due</h3></div><button onClick={() => setView("clients")}>Open clients</button></div>
              {renewalsSummary.length ? renewalsSummary.map((site) => <div className="ops-home-row" key={site.id}><span><strong>{site.company_name}</strong><small>{site.city || "Host site"}</small></span><b className="ops-risk">{site.days_to_renewal}d</b></div>) : <p className="ops-home-empty">No renewals due in 60 days.</p>}
            </section>
          </div>
        )}

        {/* ── FEEDBACK VIEW ───────────────────────────────────────────────── */}
        {view === "feedback" && (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Phone</th><th>Rating</th><th>Comment</th><th>Date</th>
                </tr>
              </thead>
              <tbody>
                {feedback.map((f, i) => (
                  <tr key={f.id}>
                    <td><span className="row-num">{i + 1}</span></td>
                    <td><span className="phone-tag">{f.phone}</span></td>
                    <td>
                      <div className="star-rating">
                        {"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}
                        <span className="rating-num">{f.rating}/5</span>
                      </div>
                    </td>
                    <td>{f.comment}</td>
                    <td className="date-cell">{f.created_at ? new Date(f.created_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── PRODUCTS VIEW ───────────────────────────────────────────────── */}
        {view === "products" && (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>#</th><th>Phone</th><th>Type</th><th>Date</th></tr>
              </thead>
              <tbody>
                {products.map((p, i) => (
                  <tr key={p.id}>
                    <td><span className="row-num">{i + 1}</span></td>
                    <td><span className="phone-tag">{p.phone}</span></td>
                    <td><span className="type-tag">{p.type}</span></td>
                    <td className="date-cell">{p.created_at ? new Date(p.created_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── ANALYTICS VIEW ──────────────────────────────────────────────── */}
        {view === "analytics" && (
          <>
            <section className="analytics-hero">
              <div className="analytics-hero-copy">
                <div className="analytics-eyebrow"><span className="analytics-status-dot" /> Operations intelligence</div>
                <h2>Understand every customer moment.</h2>
                <p>Monitor demand, resolution health, and refund movement from one focused workspace.</p>
              </div>
              <div className="analytics-hero-meta">
                <span className="analytics-meta-label">Reporting window</span>
                <strong>All available activity</strong>
                <span className="analytics-meta-date">Updated {new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
              </div>
            </section>

            <div className="analytics-signal-grid">
              <div className="analytics-signal-card signal-primary">
                <div className="signal-label">Resolution health</div>
                <div className="signal-value">{closureRate}%</div>
                <div className="signal-foot">Closed, resolved, or refunded</div>
                <div className="signal-progress"><span style={{ width: `${Math.min(100, closureRate)}%` }} /></div>
              </div>
              <div className="analytics-signal-card">
                <div className="signal-label">Open workload</div>
                <div className="signal-value">{openCount}</div>
                <div className="signal-foot">Tickets needing attention now</div>
                <div className="signal-accent accent-blue" />
              </div>
              <div className="analytics-signal-card">
                <div className="signal-label">Automation share</div>
                <div className="signal-value">{automationRate}%</div>
                <div className="signal-foot">Tickets closed by inactivity rule</div>
                <div className="signal-accent accent-amber" />
              </div>
              <div className="analytics-signal-card">
                <div className="signal-label">Leading demand</div>
                <div className="signal-value signal-value-text">{topIssueLabel}</div>
                <div className="signal-foot">{topIssue?.count || 0} reported cases</div>
                <div className="signal-accent accent-green" />
              </div>
            </div>

            {/* Analytics KPI strip */}
            <div className="stat-cards analytics-kpi" style={{ marginBottom: 28 }}>
              <div className="stat-card">
                <div className="stat-icon red"><span>📋</span></div>
                <div>
                  <div className="stat-num">{totalIssues}</div>
                  <div className="stat-label">Total Issues</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon amber"><span>⚠️</span></div>
                <div>
                  <div className="stat-num">{analyticsCategory.length}</div>
                  <div className="stat-label">Issue Types</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon blue"><span>📅</span></div>
                <div>
                  <div className="stat-num">{avgMonthly}</div>
                  <div className="stat-label">Avg / Month</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon green"><span>🏆</span></div>
                <div>
                  <div className="stat-num" style={{ fontSize: 16, letterSpacing: "-0.4px", marginTop: 3 }}>
                    {topIssue ? topIssue.count : "—"}
                  </div>
                  <div className="stat-label">Top Issue Count</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon purple"><span>↗</span></div>
                <div>
                  <div className="stat-num">{latestMonth?.count || 0}</div>
                  <div className="stat-label">Latest Month</div>
                </div>
              </div>
            </div>

            {/* Refund Analytics */}
            <div className="stat-cards" style={{ marginBottom: 28 }}>
              <div className="stat-card">
                <div className="stat-icon green"><span>💰</span></div>
                <div>
                  <div className="stat-num">₹{totalRefundToday || "0"}</div>
                  <div className="stat-label">Refunds Today</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon blue"><span>📊</span></div>
                <div>
                  <div className="stat-num">₹{totalRefundMonth || "0"}</div>
                  <div className="stat-label">Refunds This Month</div>
                </div>
              </div>
            </div>

            {/* Refund Charts */}
            <div className="analytics-grid">
              {/* Daily Refunds Chart */}
              <div className="analytics-card full-width">
                <div className="analytics-card-header">
                  <div className="analytics-card-header-left">
                    <span className="analytics-card-eyebrow">Daily</span>
                    <h3>Refunds Per Day</h3>
                  </div>
                  <span className="chart-badge">Bar</span>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={refundDaily} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f7" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#8c96ae", fontFamily: "Inter" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#8c96ae", fontFamily: "Inter" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="total_refund" fill="#10b981" radius={[5, 5, 0, 0]} name="Refund Amount" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Monthly Refunds Chart */}
              <div className="analytics-card full-width">
                <div className="analytics-card-header">
                  <div className="analytics-card-header-left">
                    <span className="analytics-card-eyebrow">Monthly</span>
                    <h3>Refunds Per Month</h3>
                  </div>
                  <span className="chart-badge">Area</span>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={refundMonthly} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="refundGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f7" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: "#8c96ae", fontFamily: "Inter" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#8c96ae", fontFamily: "Inter" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="total_refund"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      fill="url(#refundGrad)"
                      dot={{ fill: "#10b981", r: 4, strokeWidth: 2, stroke: "#fff" }}
                      name="Monthly Refunds"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="analytics-grid">

              {/* ── Daily Sub-Issues Stacked Bar ── */}
              <div className="analytics-card full-width">
                <div className="analytics-card-header">
                  <div className="analytics-card-header-left">
                    <span className="analytics-card-eyebrow">Daily Breakdown</span>
                    <h3>Sub-Issues Over Time</h3>
                  </div>
                  <span className="chart-badge">Stacked Bar</span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analyticsDaily} barCategoryGap="30%" margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f7" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#8c96ae", fontFamily: "Inter" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#8c96ae", fontFamily: "Inter" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: 12, color: "#4a5468", fontFamily: "Inter", paddingTop: 20 }}
                      iconType="circle"
                      iconSize={8}
                    />
                    {analyticsDailyKeys.map((key, i) => (
                      <Bar
                        key={key}
                        dataKey={key}
                        stackId="subIssues"
                        fill={COLORS[i % COLORS.length]}
                        radius={i === analyticsDailyKeys.length - 1 ? [5, 5, 0, 0] : [0, 0, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* ── Monthly Trend Area Chart ── */}
              <div className="analytics-card">
                <div className="analytics-card-header">
                  <div className="analytics-card-header-left">
                    <span className="analytics-card-eyebrow">Trend</span>
                    <h3>Monthly Volume</h3>
                  </div>
                  <span className="chart-badge">Area</span>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={analyticsMonthly} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#e8192c" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#e8192c" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f7" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: "#8c96ae", fontFamily: "Inter" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#8c96ae", fontFamily: "Inter" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#e8192c"
                      strokeWidth={2.5}
                      fill="url(#areaGrad)"
                      dot={{ fill: "#e8192c", r: 4, strokeWidth: 2, stroke: "#fff" }}
                      activeDot={{ r: 6, stroke: "#e8192c", strokeWidth: 2, fill: "#fff" }}
                      name="Issues"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* ── Issue Breakdown Donut + Legend ── */}
              <div className="analytics-card">
                <div className="analytics-card-header">
                  <div className="analytics-card-header-left">
                    <span className="analytics-card-eyebrow">Composition</span>
                    <h3>Issue Breakdown</h3>
                  </div>
                  <span className="chart-badge">Donut</span>
                </div>
                <div className="pie-container">
                  <PieChart width={210} height={210}>
                    <Pie
                      data={selectedIssue === "ALL"
                        ? analyticsCategory
                        : analyticsCategory.filter((i) => i.issue === selectedIssue)}
                      dataKey="count"
                      nameKey="issue"
                      outerRadius={95}
                      innerRadius={52}
                      paddingAngle={2}
                    >
                      {(selectedIssue === "ALL"
                        ? analyticsCategory
                        : analyticsCategory.filter((i) => i.issue === selectedIssue)
                      ).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip
                      content={<CustomTooltip />}
                      formatter={(value, name) => [`${value}`, name]}
                    />
                  </PieChart>

                  <div className="pie-legend">
                    <button
                      className={`legend-btn ${selectedIssue === "ALL" ? "active" : ""}`}
                      onClick={() => setSelectedIssue("ALL")}
                    >
                      All Issues
                    </button>
                    {analyticsCategory.map((item, i) => (
                      <button
                        key={item.issue}
                        className={`legend-btn ${selectedIssue === item.issue ? "active" : ""}`}
                        onClick={() => setSelectedIssue(item.issue)}
                      >
                        <span className="legend-dot" style={{ background: COLORS[i % COLORS.length] }} />
                        <span style={{ flex: 1 }}>{item.issue}</span>
                        <strong style={{ marginLeft: 6, color: "#0b0f1a", fontSize: 12 }}>{item.count}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          </>
        )}
      </main>

      {/* ── CHAT PANEL ──────────────────────────────────────────────────────── */}
      {upiScanTicketId && tickets.some((ticket) => ticket.id === upiScanTicketId) && (
        <UpiScanDetails ticket={tickets.find((ticket) => ticket.id === upiScanTicketId)} onClose={() => setUpiScanTicketId(null)} onRescan={rescanUpi} />
      )}

      {activeChat && (
        <div className="chat-panel">
          <div className="chat-header">
            <div className="chat-header-info">
              <div className="chat-avatar">
                {activeChat.phone?.slice(-2)}
              </div>
              <div>
                <div className="chat-phone">{activeChat.phone}</div>
                <span className={`chat-mode-badge ${activeChat.takeover ? "badge-admin" : "badge-bot"}`}>
                  {activeChat.takeover ? "👤 Admin Mode" : "🤖 Bot Mode"}
                </span>
              </div>
            </div>
            <div className="chat-header-actions">
              <button type="button" className={`chat-tools-toggle ${showTicketTools ? "active" : ""}`} onClick={() => setShowTicketTools((value) => !value)}>
                Details
              </button>
              {!activeChat.takeover ? (
                <button className="chat-takeover-btn" onClick={takeover}>
                  Take Over
                </button>
              ) : (
                <button className="chat-release-btn" onClick={release}>
                  Release
                </button>
              )}
              <button className="chat-close-btn" onClick={() => { setActiveChat(null); setMessages([]); }}>
                {Icon.close}
              </button>
            </div>
          </div>

          <div className={`chat-ticket-tools ${showTicketTools ? "mobile-show" : ""}`}>
            <div className="chat-tool-row">
              <label>
                Priority
                <select
                  value={ticketDraft.priority}
                  onChange={(e) => setTicketDraft((prev) => ({ ...prev, priority: e.target.value }))}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
              <label>
                Assigned to
                <input
                  value={ticketDraft.assigned_to}
                  onChange={(e) => setTicketDraft((prev) => ({ ...prev, assigned_to: e.target.value }))}
                  placeholder="Agent name"
                />
              </label>
            </div>
            <label className="chat-notes-field">
              Internal notes
              <textarea
                value={ticketDraft.admin_notes}
                onChange={(e) => setTicketDraft((prev) => ({ ...prev, admin_notes: e.target.value }))}
                placeholder="Visible only to your support team"
                rows="2"
              />
            </label>
            <div className="chat-tool-actions">
              <button type="button" className="chat-save-btn" onClick={updateTicketDetails}>Save details</button>
              {(activeChat.state === "CLOSED" || activeChat.status === "auto_closed") && (
                <button type="button" className="chat-reopen-btn" onClick={reopenTicket}>Reopen ticket</button>
              )}
            </div>
          </div>

          <TicketChat
            ticket={activeChat}
            messages={messages}
            typing={typing}
            api={API}
            headers={authHeaders()}
            onChanged={() => fetchMessages(activeChat.id)}
            onTakeover={takeover}
          />
        </div>
      )}
    </div>
  );
}