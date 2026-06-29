import { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
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

  const [view, setView] = useState("tickets");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [loadingId, setLoadingId] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  // ✅ Track previous message count and typing timeout for indicator
  const prevMessageCountRef = useRef(0);
  const typingTimeoutRef = useRef(null);

  /* =========================================================================
     AUTH
  ========================================================================= */
  const login = async () => {
    try {
      const res = await API.post("/login", { username, password });
      localStorage.setItem("token", res.data.token);
      setToken(res.data.token);
      setSessionExpired(false);
    } catch {
      alert("Login failed");
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken("");
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
        const prevStr = JSON.stringify(prev.map((t) => ({ id: t.id, status: t.status, state: t.state, takeover: t.takeover })));
        const nextStr = JSON.stringify(incoming.map((t) => ({ id: t.id, status: t.status, state: t.state, takeover: t.takeover })));
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

  /* =========================================================================
     EFFECTS
  ========================================================================= */
  useEffect(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [messages, typing]);

  useEffect(() => {
    if (!token) return;
    const loadData = async () => {
      await fetchTickets();
      await fetchProducts();
      await fetchAnalytics();
      await fetchRefundAnalytics(); 
      await fetchFeedback();
    };
    loadData();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  

  useEffect(() => {
    if (!activeChat?.id) return;
    const loadMessages = async () => { await fetchMessages(activeChat.id); };
    loadMessages();
    const interval = setInterval(() => { loadMessages(); }, 2000);
    return () => clearInterval(interval);
  }, [activeChat, fetchMessages]);

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
      const res = await API.post("/admin/takeover", { phone: activeChat.phone }, { headers: authHeaders() });
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
      const res = await API.post("/admin/release", { phone: activeChat.phone }, { headers: authHeaders() });
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
          <button
            className={`nav-item ${view === "tickets" ? "active" : ""}`}
            onClick={() => setView("tickets")}
          >
            {Icon.ticket}
            <span>Tickets</span>
            {openCount > 0 && <span className="nav-badge">{openCount}</span>}
          </button>
          <button
            className={`nav-item ${view === "feedback" ? "active" : ""}`}
            onClick={() => setView("feedback")}
          >
            {Icon.feedback}
            <span>Feedback</span>
          </button>
          <button
            className={`nav-item ${view === "products" ? "active" : ""}`}
            onClick={() => setView("products")}
          >
            {Icon.product}
            <span>Products</span>
          </button>

          <div className="sidebar-divider" />
          <div className="sidebar-section-label">Insights</div>
          <button
            className={`nav-item ${view === "analytics" ? "active" : ""}`}
            onClick={() => setView("analytics")}
          >
            {Icon.analytics}
            <span>Analytics</span>
          </button>
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
            </h1>
            <p className="page-sub">
              {view === "tickets" && `${filteredTickets.length} tickets · ${openCount} open`}
              {view === "feedback" && `${feedback.length} responses collected`}
              {view === "products" && `${products.length} product leads`}
              {view === "analytics" && "Issue breakdown and trends"}
            </p>
          </div>
          <div className="page-live">
            <span className="live-dot" />
            <span className="live-text">Live</span>
          </div>
        </div>

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
                <option value="refunded">Refunded</option>
                <option value="auto_refunded">Auto Refunded</option>
                <option value="resolved">Resolved</option>
              </select>
              <button className="btn-icon" onClick={fetchTickets} title="Refresh">
                {Icon.refresh}
                Refresh
              </button>
            </div>

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
                    return (
                      <tr key={t.id} className={isClosed ? "row-closed" : ""}>
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
                            {t.status || "—"}
                          </span>
                        </td>
                        <td>
                          <span className={`state-pill ${t.state === "OPEN" ? "state-open" : "state-closed"}`}>
                            {t.state}
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