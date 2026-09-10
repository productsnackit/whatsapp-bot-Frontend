import { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import "./styles.css";

const API = axios.create({
  baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com",
});

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
  const [employeeCredentials, setEmployeeCredentials] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const chatEndRef = useRef(null);

  const [tickets, setTickets] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [products, setProducts] = useState([]);

  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
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

  const [view, setView] = useState(localStorage.getItem("userRole") === "employee" ? "internal-chat" : "tickets");
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
  const isAdmin = userRole === "admin";
  const [internalUsers, setInternalUsers] = useState([]);
  const [internalChats, setInternalChats] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState(localStorage.getItem("userDepartment") || "Accounts");
  const [selectedInternalChatId, setSelectedInternalChatId] = useState(null);
  const [internalMessage, setInternalMessage] = useState("");
  const [internalTag, setInternalTag] = useState("");
  const [internalPriority, setInternalPriority] = useState("medium");
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [notificationToast, setNotificationToast] = useState(null);
  const [showTaggedOnly, setShowTaggedOnly] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ name: "", department: "Accounts", role: "Analyst", tags: "finance, operations" });
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const [employeeDraft, setEmployeeDraft] = useState({});
  const socketRef = useRef(null);

  const triggerInternalNotification = useCallback((title, priority, message) => {
    setNotificationToast({ title, priority, message });
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(title, { body: message });
      } else if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => null);
      }
    }
    window.setTimeout(() => setNotificationToast(null), 3500);
  }, []);

  const departmentUsers = internalUsers.filter((user) => user.department === selectedDepartment);
  const departmentTags = Array.from(new Set(departmentUsers.flatMap((user) => user.tags || [])));
  const departmentChats = internalChats.filter((chat) => chat.department === selectedDepartment);
  const availableDepartments = departments;
  const visibleChats = showTaggedOnly
    ? internalChats.filter((chat) => chat.messages?.some((message) => (message.recipientIds || []).map(String).includes(String(currentUserId))))
    : departmentChats;
  const selectedInternalChat = (showTaggedOnly ? visibleChats : departmentChats).find((chat) => chat.id === selectedInternalChatId)
    || (showTaggedOnly ? visibleChats[0] : departmentChats[0])
    || null;

  useEffect(() => {
    if (selectedDepartment && !visibleChats.some((chat) => chat.id === selectedInternalChatId) && visibleChats[0]) {
      setSelectedInternalChatId(visibleChats[0].id);
    }
  }, [selectedDepartment, visibleChats, selectedInternalChatId]);

  useEffect(() => {
    if (!departmentTags.includes(internalTag)) {
      setInternalTag(departmentTags[0] || "");
    }
  }, [departmentTags, internalTag]);

  const handleSendInternalMessage = async () => {
    const messageText = internalMessage.trim();
    const hasAttachment = attachedFiles.length > 0;
    if (!messageText && !hasAttachment) return;

    try {
      let activeChat = selectedInternalChat;
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

      const response = await API.post(
        `/internal/chats/${activeChat.id}/messages`,
        {
          sender: currentUserName,
          text: messageText,
          tag: internalTag,
          priority: internalPriority,
          sourceUser: currentUserName,
          attachments: serializedAttachments,
          recipientIds: selectedRecipients.length ? selectedRecipients : internalUsers.map((user) => String(user.id)),
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
        `${internalTag.toUpperCase()} tag: ${messageText || "Attachment sent"}`
      );

      setInternalMessage("");
      setAttachedFiles([]);
    } catch (err) {
      alert(err.message || "Failed to send internal message");
      console.log(err);
    }
  };

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

  const startEditingEmployee = (user) => {
    setEditingEmployeeId(user.id);
    setEmployeeDraft({ ...user, tags: (user.tags || []).join(", ") });
  };

  const saveEmployee = async () => {
    if (!editingEmployeeId) return;
    try {
      const response = await API.patch(`/internal/users/${editingEmployeeId}`, employeeDraft, { headers: authHeaders() });
      if (response.data?.user) {
        setInternalUsers((prev) => prev.map((user) => String(user.id) === String(response.data.user.id) ? response.data.user : user));
      }
      setEditingEmployeeId(null);
      setEmployeeDraft({});
      triggerInternalNotification("Employee details updated", "low", `${employeeDraft.name} profile and login details were saved.`);
    } catch (err) {
      alert("Failed to update employee details");
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
    try {
      const res = await API.post("/login", { username, password });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("userRole", res.data.role || "admin");
      localStorage.setItem("userName", res.data.name || "Admin");
      localStorage.setItem("userDepartment", res.data.department || "Accounts");
      localStorage.setItem("userId", res.data.userId || "");
      setToken(res.data.token);
      setUserRole(res.data.role || "admin");
      setCurrentUserName(res.data.name || "Admin");
      setCurrentUserDepartment(res.data.department || "Accounts");
      setCurrentUserId(res.data.userId || "");
      setSelectedDepartment(res.data.department || "Accounts");
      setView(res.data.role === "employee" ? "internal-chat" : "tickets");
      setSessionExpired(false);
    } catch {
      alert("Login failed");
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    localStorage.removeItem("userDepartment");
    localStorage.removeItem("userId");
    setToken("");
    setUserRole("admin");
    setCurrentUserName("Admin");
    setCurrentUserDepartment("Accounts");
    setCurrentUserId("");
    setActiveChat(null);
    setMessages([]);
  };

  /* =========================================================================
     FETCH HELPERS
  ========================================================================= */
  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

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
            new Notification("New support ticket", { body: "A new customer request needs attention." });
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

  const fetchInternalData = useCallback(async () => {
    if (!token) return;
    try {
      const [usersRes, chatsRes] = await Promise.all([
        API.get("/internal/users", { headers: authHeaders() }),
        API.get("/internal/chats", { headers: authHeaders() }),
      ]);

      setInternalUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
      setInternalChats(Array.isArray(chatsRes.data) ? chatsRes.data : []);
    } catch (err) {
      console.log("Internal data error:", err);
    }
  }, [token, authHeaders]);

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
      if (!isAdmin) {
        await fetchInternalData();
        return;
      }
      await fetchTickets();
      await fetchProducts();
      await fetchInternalData();
      await fetchAnalytics();
      await fetchRefundAnalytics(); 
      await fetchFeedback();
      await fetchSettings();
    };
    loadData();
  }, [token, isAdmin, fetchInternalData]); // eslint-disable-line react-hooks/exhaustive-deps

  

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
    });

    socket.on("internal-chat-updated", ({ chat, notification }) => {
      if (!chat) return;
      setInternalChats((prev) => {
        const exists = prev.some((item) => String(item.id) === String(chat.id));
        if (exists) {
          return prev.map((item) => (String(item.id) === String(chat.id) ? chat : item));
        }
        return [chat, ...prev];
      });

      if (notification) {
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
      if (!notification) return;
      triggerInternalNotification(notification.title || "Department alert", notification.priority || "medium", notification.message || "New internal update");
    });

    return () => {
      socket.off("internal-chat-updated");
      socket.off("internal-chat-deleted");
      socket.off("internal-user-updated");
      socket.off("internal-notification");
      socket.disconnect();
    };
  }, [token, triggerInternalNotification]);

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

  const sendMessage = async () => {
    if (!activeChat || !chatInput.trim()) return;
    const messageText = chatInput.trim();
    setChatInput("");
    try {
      await API.post(
        "/admin/send",
        { phone: activeChat.phone, message: messageText, ticketId: activeChat.id },
        { headers: authHeaders() }
      );
      await fetchMessages(activeChat.id);
    } catch (err) {
      alert("Send failed");
      setChatInput(messageText);
      console.log(err);
    }
  };

  const handleChatKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
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
            <button className="login-btn" onClick={login}>
              Sign In
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* =========================================================================
     MAIN DASHBOARD
  ========================================================================= */
  return (
    <div className="dashboard">

      {/* ── SIDEBAR ─────────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="logo" />
          <span>Snackit</span>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Main Menu</div>
          {isAdmin && <button
            className={`nav-item ${view === "tickets" ? "active" : ""}`}
            onClick={() => setView("tickets")}
          >
            {Icon.ticket}
            <span>Tickets</span>
            {openCount > 0 && <span className="nav-badge">{openCount}</span>}
          </button>}
          {isAdmin && <button
            className={`nav-item ${view === "feedback" ? "active" : ""}`}
            onClick={() => setView("feedback")}
          >
            {Icon.feedback}
            <span>Feedback</span>
          </button>}
          {isAdmin && <button
            className={`nav-item ${view === "products" ? "active" : ""}`}
            onClick={() => setView("products")}
          >
            {Icon.product}
            <span>Products</span>
          </button>}

          {isAdmin && <><div className="sidebar-divider" />
          <div className="sidebar-section-label">Insights</div>
          <button
            className={`nav-item ${view === "analytics" ? "active" : ""}`}
            onClick={() => setView("analytics")}
          >
            {Icon.analytics}
            <span>Analytics</span>
          </button></>}
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
            <span>Employee Details</span>
          </button>}
        </nav>

        <button className="sidebar-logout" onClick={logout}>
          {Icon.logout}
          <span>Logout</span>
        </button>
      </aside>

      {/* ── MAIN CONTENT ────────────────────────────────────────────────────── */}
      <main className={`main-content ${activeChat ? "chat-open" : ""}`}>

        {/* ── PAGE HEADER ─────────────────────────────────────────────────── */}
        <div className="page-header">
          <div className="page-title">
            <h1>
              {view === "tickets" && "Support Tickets"}
              {view === "feedback" && "Customer Feedback"}
              {view === "products" && "Product Leads"}
              {view === "analytics" && "Analytics"}
              {view === "internal-chat" && "Internal Chat"}
              {view === "employees" && "Employee Details"}
            </h1>
            <p className="page-sub">
              {view === "tickets" && `${filteredTickets.length} tickets · ${openCount} open`}
              {view === "feedback" && `${feedback.length} responses collected`}
              {view === "products" && `${products.length} product leads`}
              {view === "analytics" && "Issue breakdown and trends"}
              {view === "internal-chat" && `${departmentChats.length} active ${selectedDepartment} conversations`}
              {view === "employees" && `${internalUsers.length} employees with login access`}
            </p>
          </div>
          <div className="page-live">
            <span className="live-dot" />
            <span className="live-text">Live</span>
          </div>
        </div>

        {view === "employees" && isAdmin && (
          <section className="employee-details-page">
            <div className="employee-details-intro">
              <div>
                <span className="employee-eyebrow">Admin workspace</span>
                <h2>Employee details and login credentials</h2>
                <p>Edit department access, role, tags, username, or password. Share passwords directly with employees when they forget them.</p>
              </div>
              <strong>{internalUsers.length} employees</strong>
            </div>
            <div className="employee-details-list">
              {internalUsers.map((user) => (
                <div className="employee-detail-card" key={user.id}>
                  {editingEmployeeId === user.id ? (
                    <div className="employee-edit-grid">
                      <input value={employeeDraft.name || ""} onChange={(event) => setEmployeeDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="Name" />
                      <select value={employeeDraft.department || ""} onChange={(event) => setEmployeeDraft((prev) => ({ ...prev, department: event.target.value }))}>
                        {departments.map((department) => <option key={department}>{department}</option>)}
                      </select>
                      <input value={employeeDraft.role || ""} onChange={(event) => setEmployeeDraft((prev) => ({ ...prev, role: event.target.value }))} placeholder="Role" />
                      <input value={employeeDraft.tags || ""} onChange={(event) => setEmployeeDraft((prev) => ({ ...prev, tags: event.target.value }))} placeholder="Tags" />
                      <input value={employeeDraft.username || ""} onChange={(event) => setEmployeeDraft((prev) => ({ ...prev, username: event.target.value }))} placeholder="Username" />
                      <input value={employeeDraft.password || ""} onChange={(event) => setEmployeeDraft((prev) => ({ ...prev, password: event.target.value }))} placeholder="Password" />
                      <div className="employee-edit-actions">
                        <button type="button" className="employee-save-btn" onClick={saveEmployee}>Save changes</button>
                        <button type="button" className="employee-cancel-btn" onClick={() => setEditingEmployeeId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="employee-detail-main">
                        <div className="employee-avatar">{user.name.slice(0, 1).toUpperCase()}</div>
                        <div>
                          <h3>{user.name}</h3>
                          <p>{user.department} · {user.role}</p>
                          <div className="internal-tags">{(user.tags || []).map((tag) => <span className="team-tag" key={tag}>#{tag}</span>)}</div>
                        </div>
                      </div>
                      <div className="employee-login-details">
                        <span>Username <b>{user.username}</b></span>
                        <span>Password <b>{user.password}</b></span>
                      </div>
                      <button type="button" className="employee-edit-btn" onClick={() => startEditingEmployee(user)}>Edit details</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {view === "internal-chat" && (
          <div className="internal-chat-shell">
            <div className="internal-chat-layout">
              <aside className="internal-thread-panel">
                <div className="internal-panel-header">Departments</div>
                <div className="internal-department-tabs">
                  {availableDepartments.map((department) => (
                    <button
                      key={department}
                      type="button"
                      className={`department-tab ${selectedDepartment === department ? "active" : ""}`}
                      onClick={() => setSelectedDepartment(department)}
                    >
                      {department}
                    </button>
                  ))}
                </div>

                <div className="internal-panel-header">Chats</div>
                <button
                  type="button"
                  className={`tagged-messages-toggle ${showTaggedOnly ? "active" : ""}`}
                  onClick={() => setShowTaggedOnly((value) => !value)}
                >
                  {showTaggedOnly ? "Show department chats" : "Messages tagged to me"}
                </button>
                {visibleChats.length ? (
                  visibleChats.map((chat) => (
                    <div key={chat.id} className="internal-thread-wrap">
                      <button
                        type="button"
                        className={`internal-thread-card ${selectedInternalChat?.id === chat.id ? "selected" : ""}`}
                        onClick={() => setSelectedInternalChatId(chat.id)}
                      >
                        <div className="internal-thread-top">
                          <strong>{chat.title}</strong>
                          <span className={`priority-badge priority-${chat.priority || "medium"}`}>{chat.priority || "medium"}</span>
                        </div>
                        <div className="internal-thread-meta">{chat.participants.join(", ")}</div>
                        <div className="internal-thread-meta">{chat.messages.at(-1)?.text || "No messages"}</div>
                      </button>
                      {isAdmin && (
                        <button type="button" className="internal-delete-btn" onClick={() => handleDeleteChat(chat.id)}>Delete</button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="internal-empty-state">No chat in this department yet.</div>
                )}
              </aside>

              <section className="internal-conversation-panel">
                <div className="internal-chat-header">
                  <div>
                    <h3>{selectedInternalChat ? selectedInternalChat.title : `${selectedDepartment} chat`}</h3>
                    <p>{departmentUsers.length} team members · Messages are visible to this department</p>
                    <span className={`priority-badge priority-${(selectedInternalChat?.priority || internalPriority)}`}>
                      {(selectedInternalChat?.priority || internalPriority)} priority
                    </span>
                  </div>
                </div>

                <div className="internal-messages">
                  {selectedInternalChat && selectedInternalChat.messages.length ? (
                    selectedInternalChat.messages.map((message) => (
                      <div key={message.id} className={`internal-message-row ${message.sender === "You" || message.sender === "Admin" ? "outgoing" : "incoming"} message-priority-${message.priority || selectedInternalChat?.priority || "medium"}`}>
                        <div className="internal-message-bubble">
                          <div className="internal-message-meta">
                            <strong>{message.sender}</strong>
                            <span>{message.time}</span>
                          </div>
                          <div>{message.text}</div>
                          {message.attachments?.length ? (
                            <div className="message-attachment-list">
                              {message.attachments.map((file, idx) => (
                                <div key={`${file.name}-${idx}`} className="message-attachment-item">
                                  {file.type?.startsWith("image/") && file.dataUrl ? (
                                    <img className="message-image" src={file.dataUrl} alt={file.name} />
                                  ) : null}
                                  <span className="message-attachment">{file.name}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {message.tag && message.tag !== "general" && <span className="message-tag">#{message.tag}</span>}
                          <div className="message-status-row">
                            <span className={`message-status status-${message.status || "open"}`}>{(message.status || "open").replace("-", " ")}</span>
                            {(isAdmin || message.recipientIds?.map(String).includes(String(currentUserId)) || message.sender === currentUserName) && (
                              <select
                                value={message.status || "open"}
                                onChange={(event) => handleUpdateMessageStatus(selectedInternalChat.id, message.id, event.target.value)}
                                aria-label="Update message status"
                              >
                                <option value="open">Open</option>
                                <option value="in-progress">In progress</option>
                                <option value="resolved">Resolved</option>
                              </select>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="internal-empty-state large">Start a message for {selectedDepartment}.</div>
                  )}
                </div>

                <div className="internal-composer">
                  <div className="priority-picker" aria-label="Message priority">
                    <span className="composer-label">Priority</span>
                    {[
                      { value: "low", label: "Low", color: "green" },
                      { value: "medium", label: "Medium", color: "yellow" },
                      { value: "urgent", label: "Urgent", color: "red" },
                    ].map((priority) => (
                      <button
                        key={priority.value}
                        type="button"
                        className={`priority-choice ${priority.color} ${internalPriority === priority.value ? "selected" : ""}`}
                        onClick={() => setInternalPriority(priority.value)}
                      >
                        <span className="priority-dot" />
                        {priority.label}
                      </button>
                    ))}
                  </div>
                  <div className="message-compose-row">
                    <select value={internalTag} onChange={(event) => setInternalTag(event.target.value)} aria-label="Message tag">
                      {departmentTags.length ? departmentTags.map((tag) => (
                        <option value={tag} key={tag}>#{tag}</option>
                      )) : <option value="">No tag</option>}
                    </select>
                  <input
                    type="text"
                    value={internalMessage}
                    onChange={(event) => setInternalMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleSendInternalMessage();
                      }
                    }}
                    placeholder={`Message ${selectedDepartment}...`}
                  />
                  <label className="internal-file-picker">
                    <input
                      type="file"
                      multiple
                      onChange={(event) => setAttachedFiles(Array.from(event.target.files || []))}
                    />
                    Attach file
                  </label>
                  <button className="internal-send-button" type="button" onClick={handleSendInternalMessage}>
                    {Icon.send}
                    Send
                  </button>
                  </div>
                </div>

                {attachedFiles.length > 0 && (
                  <div className="attachment-preview-row">
                    {attachedFiles.map((file) => (
                      <span key={file.name} className="message-attachment">{file.name}</span>
                    ))}
                  </div>
                )}

                <div className="internal-recipient-box">
                  <div className="recipient-heading">
                    <div className="internal-panel-header">Tag people</div>
                    <span>{selectedRecipients.length ? `${selectedRecipients.length} selected` : "Notify the whole department if none selected"}</span>
                  </div>
                  <div className="internal-recipient-list">
                    {internalUsers.length ? internalUsers.map((user) => (
                      <label key={user.id} className="recipient-check">
                        <input
                          type="checkbox"
                          checked={selectedRecipients.includes(String(user.id))}
                          onChange={(event) => {
                            const userId = String(user.id);
                            setSelectedRecipients((prev) =>
                              event.target.checked ? [...prev, userId] : prev.filter((id) => id !== userId)
                            );
                          }}
                        />
                        <span>{user.name}</span>
                      </label>
                    )) : <span className="internal-empty-state">Add employees first to tag them.</span>}
                  </div>
                </div>
              </section>

              <aside className="internal-team-panel">
                <div className="internal-panel-header">Team members</div>
                <div className="internal-team-list">
                  {departmentUsers.length ? departmentUsers.map((user) => (
                    <div key={user.id} className="internal-team-card">
                      <div className="internal-team-head">
                        <div>
                          <div className="internal-team-name">{user.name}</div>
                          <div className="internal-team-role">{user.role}</div>
                        </div>
                        {isAdmin && (
                          <button type="button" className="internal-delete-row" onClick={() => handleDeleteUser(user.id)}>Delete</button>
                        )}
                      </div>
                      <div className="internal-tags">
                        {(user.tags || []).map((tag) => <span key={tag} className="team-tag">#{tag}</span>)}
                      </div>
                    </div>
                  )) : <div className="internal-empty-state">No team members for this department yet.</div>}
                </div>

                {isAdmin && <><div className="internal-panel-header">Add employee</div>
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
                )}</>}
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
              <button
                type="button"
                className="settings-trigger"
                onClick={() => setShowSettings((prev) => !prev)}
              >
                Bot Settings
              </button>
              <button
                type="button"
                className={`paytm-toggle ${paytmVerificationEnabled ? "paytm-toggle-on" : ""}`}
                onClick={() => updatePaytmSetting(!paytmVerificationEnabled)}
                title="Toggle Paytm verification"
              >
                <span className="paytm-toggle-dot" />
                <span>{paytmVerificationEnabled ? "Paytm ON" : "Paytm OFF"}</span>
              </button>
              <button className="btn-icon" onClick={fetchTickets} title="Refresh">
                {Icon.refresh}
                Refresh
              </button>
              <button className="btn-icon export-btn" onClick={exportTickets} title="Export tickets">
                Export CSV
              </button>
            </div>

            {showSettings && (
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

            <div className="table-wrapper">
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
                      <tr key={t.id} className={isAutoClosed ? "row-auto-closed" : isClosed ? "row-closed" : ""}>
                        <td><span className="row-num">{i + 1}</span></td>
                        <td><span className="phone-tag">{t.phone}</span></td>
                        <td>{t.main_issue || <span className="na">—</span>}</td>
                        <td>{t.sub_issue || <span className="na">—</span>}</td>
                        <td>{t.location || <span className="na">—</span>}</td>
                        <td>{t.upi_id || <span className="na">—</span>}</td>
                        <td>
                          {t.image ? (
                            <img src={t.image} alt="img" className="thumb" onClick={() => window.open(t.image, "_blank")} />
                          ) : <span className="na">—</span>}
                        </td>
                        <td>
                          {t.upi_image ? (
                            <img src={t.upi_image} alt="upi" className="thumb" onClick={() => window.open(t.upi_image, "_blank")} />
                          ) : <span className="na">—</span>}
                        </td>
                        <td>
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
                        <td>
                          <span className={`status-badge status-${(t.status || "").replace("_", "-")}`}>
                            {t.status === "auto_closed" ? "Auto Closed" : t.status || "—"}
                          </span>
                          <span className={`priority-badge priority-${t.priority || "normal"}`}>
                            {t.priority || "normal"}
                          </span>
                        </td>
                        <td>
                          <span className={`state-pill ${t.state === "OPEN" ? "state-open" : "state-closed"}`}>
                            {isAutoClosed ? "AUTO CLOSED" : t.state}
                          </span>
                        </td>
                        <td>
                          <span className={`mode-pill ${t.takeover ? "mode-admin" : "mode-bot"}`}>
                            {t.takeover ? "👤 Admin" : "🤖 Bot"}
                          </span>
                        </td>
                        <td className="date-cell">
                          {t.created_at ? new Date(t.created_at).toLocaleString() : "—"}
                        </td>
                        <td>
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

          <div className="chat-ticket-tools">
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

          <div className="chat-body">
            {messages.length === 0 && !typing && (
              <div className="chat-empty">
                <div className="chat-empty-icon">💬</div>
                <p>No messages yet</p>
              </div>
            )}
            {messages.map((m, idx) => (
              <div
                key={m.id || `${m.created_at}-${idx}`}
                className={`msg ${m.sender === "admin" ? "msg-admin" : m.sender === "bot" ? "msg-bot" : "msg-user"}`}
              >
                <div className="msg-bubble">{m.message || m.text || ""}</div>
                {m.created_at && (
                  <div className="msg-time">
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                )}
              </div>
            ))}
            {/* ✅ FIX: Show typing indicator when user is typing */}
            {typing && (
              <div className="msg msg-user">
                <div className="msg-bubble typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="chat-input-area">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              placeholder={activeChat.takeover ? "Type a message…" : "Take over to send messages"}
              disabled={!activeChat.takeover}
              className={!activeChat.takeover ? "input-disabled" : ""}
            />
            <button
              className="send-btn"
              onClick={sendMessage}
              disabled={!activeChat.takeover || !chatInput.trim()}
            >
              {Icon.send}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}