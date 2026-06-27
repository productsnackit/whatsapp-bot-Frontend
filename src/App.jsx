import { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import "./styles.css";

const API = axios.create({
  baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com",
});

const COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6"];

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const chatEndRef = useRef(null);

  // ─── Data state ─────────────────────────────────────────────────────────────
  const [tickets, setTickets] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [products, setProducts] = useState([]);

  // ─── Chat state ─────────────────────────────────────────────────────────────
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");

  // ─── Analytics state ────────────────────────────────────────────────────────
  const [analyticsDaily, setAnalyticsDaily] = useState([]);
  const [analyticsDailyKeys, setAnalyticsDailyKeys] = useState([]);
  const [analyticsMonthly, setAnalyticsMonthly] = useState([]);
  const [analyticsCategory, setAnalyticsCategory] = useState([]);
  const [selectedIssue, setSelectedIssue] = useState("ALL");

  // ─── UI state ───────────────────────────────────────────────────────────────
  const [view, setView] = useState("tickets");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [loadingId, setLoadingId] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);

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

  // ─── FIX: no recursive call on error; returns silently so polling continues ─
  const fetchTickets = useCallback(async () => {
    if (!token) return;
    try {
      const res = await API.get("/tickets", { headers: authHeaders() });
      // ─── FIX: merge new data instead of replacing — prevents blank flash ───
      setTickets((prev) => {
        const incoming = Array.isArray(res.data) ? res.data : [];
        // Only update state if something actually changed (avoids unnecessary re-renders)
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
      // ─── FIX: NO recursive fetchTickets() call here — was causing infinite loop
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

  // ─── FIX: fetchMessages requires ticketId — guard against undefined ──────────
  const fetchMessages = useCallback(async (ticketId) => {
    if (!token || !ticketId) return;
    try {
      const res = await API.get(`/admin/messages/${ticketId}`, {
        headers: authHeaders(),
      });
      setMessages(Array.isArray(res.data) ? res.data : []);
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

  /* =========================================================================
     EFFECTS
  ========================================================================= */

  // ─── Scroll to bottom when messages change ───────────────────────────────────
  useEffect(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [messages]);

  // ─── Main polling: tickets + ancillary data every 5s ────────────────────────
  useEffect(() => {
    if (!token) return;
    fetchTickets();
    fetchFeedback();
    fetchProducts();
    fetchAnalytics();
    const interval = setInterval(() => {
      fetchTickets();
      fetchFeedback();
      fetchProducts();
      fetchAnalytics();
    }, 5000);
    return () => clearInterval(interval);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── FIX: message polling — only runs when activeChat is set, passes id ──────
  useEffect(() => {
    if (!activeChat?.id) return;

    fetchMessages(activeChat.id); // immediate load on chat open

    const interval = setInterval(() => {
      fetchMessages(activeChat.id);
    }, 3000);

    return () => clearInterval(interval);
  }, [activeChat?.id, fetchMessages]);

  // ─── FIX: sync activeChat from tickets list so takeover flag stays current ───
  useEffect(() => {
    if (!activeChat) return;
    const updated = tickets.find((t) => t.id === activeChat.id);
    if (updated) setActiveChat(updated);
  }, [tickets]); // eslint-disable-line react-hooks/exhaustive-deps

  /* =========================================================================
     ACTIONS
  ========================================================================= */
  const handleAction = async (id, action) => {
    try {
      setLoadingId(id);
      await API.post(
        "/ticket/action",
        { ticketId: id, action },
        { headers: authHeaders() }
      );
      alert(`Action "${action}" completed successfully`);
      await fetchTickets();
    } catch (err) {
      alert("Action failed. Check backend.");
      console.log(err);
    } finally {
      setLoadingId(null);
    }
  };

  // ─── FIX: takeover updates activeChat from response instead of full reload ───
  const takeover = async () => {
    if (!activeChat) return;
    try {
      const res = await API.post(
        "/admin/takeover",
        { phone: activeChat.phone },
        { headers: authHeaders() }
      );
      // Update activeChat immediately from response — no blank flash
      if (res.data?.ticket) setActiveChat(res.data.ticket);
      await fetchMessages(activeChat.id);
      // Background refresh tickets list without blocking UI
      fetchTickets();
    } catch (err) {
      alert("Takeover failed");
      console.log(err);
    }
  };

  // ─── FIX: release also updates activeChat from response ─────────────────────
  const release = async () => {
    if (!activeChat) return;
    try {
      const res = await API.post(
        "/admin/release",
        { phone: activeChat.phone },
        { headers: authHeaders() }
      );
      if (res.data?.ticket) setActiveChat(res.data.ticket);
      fetchTickets();
    } catch (err) {
      alert("Release failed");
      console.log(err);
    }
  };

  // ─── FIX: passes ticketId alongside phone for reliable message saving ────────
  const sendMessage = async () => {
    if (!activeChat || !chatInput.trim()) return;
    const messageText = chatInput.trim();
    setChatInput(""); // clear immediately for snappy UX

    try {
      await API.post(
        "/admin/send",
        { phone: activeChat.phone, message: messageText, ticketId: activeChat.id },
        { headers: authHeaders() }
      );
      // Force immediate refresh
      await fetchMessages(activeChat.id);
    } catch (err) {
      alert("Send failed");
      setChatInput(messageText); // restore on error
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
     LOGIN SCREEN
  ========================================================================= */
  if (!token) {
    return (
      <div style={{ display: "flex", height: "100vh" }}>
        <div style={{ flex: 1 }}>
          <img src="/login.png" alt="Snackit" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", background: "#fff" }}>
          <div style={{ width: "320px", padding: "40px", borderRadius: "12px", boxShadow: "0 10px 30px rgba(0,0,0,0.1)", textAlign: "center" }}>
            <h2 style={{ color: "#ef4444", marginBottom: "20px" }}>Admin Login</h2>
            <input
              type="text" placeholder="Username" value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              style={{ width: "100%", padding: "12px", marginBottom: "15px", borderRadius: "8px", border: "1px solid #ddd", outline: "none" }}
            />
            <input
              type="password" placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              style={{ width: "100%", padding: "12px", marginBottom: "20px", borderRadius: "8px", border: "1px solid #ddd", outline: "none" }}
            />
            <button
              onClick={login}
              style={{ width: "100%", padding: "12px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
            >
              Login
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
    <div className="container">
      <div className="header">
        <img src="/logo.png" alt="logo" />
        <h2>Snackit Dashboard</h2>
      </div>

      <div className="controls">
        <button className="btn red" onClick={() => setView("tickets")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6z" stroke="currentColor" strokeWidth="2" />
          </svg>
          Tickets
        </button>
        <button className="btn red-outline" onClick={() => setView("feedback")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8z" stroke="currentColor" strokeWidth="2" />
          </svg>
          Feedback
        </button>
        <button className="btn red-outline" onClick={() => setView("products")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" strokeWidth="2" />
          </svg>
          Products
        </button>
        <button className="btn red-outline" onClick={() => setView("analytics")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="2" />
          </svg>
          Analytics
        </button>
        <button className="btn red-outline" onClick={logout}>Logout</button>
      </div>

      {/* ── TICKETS VIEW ────────────────────────────────────────────────────── */}
      {view === "tickets" && (
        <>
          <div className="controls">
            <input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <select onChange={(e) => setFilter(e.target.value)}>
              <option value="">All</option>
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
              <option value="refunded">Refunded</option>
              <option value="auto_refunded">Auto Refunded</option>
              <option value="resolved">Resolved</option>
            </select>
            <button className="btn red" onClick={fetchTickets}>Refresh</button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th><th>Phone</th><th>Main</th><th>Sub</th>
                  <th>Location</th><th>UPI</th><th>Image</th><th>UPI Screenshot</th>
                  <th>Status</th><th>State</th><th>Bot</th><th>Date</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((t, i) => {
                  const isClosed = t.state === "CLOSED";
                  return (
                    <tr key={t.id} className={isClosed ? "closed-row" : ""}>
                      <td>{i + 1}</td>
                      <td>{t.phone}</td>
                      <td>{t.main_issue || "-"}</td>
                      <td>{t.sub_issue || "-"}</td>
                      <td>{t.location || "-"}</td>
                      <td>{t.upi_id || "-"}</td>
                      <td>
                        {t.image ? (
                          <img src={t.image} alt="img" style={{ width: "60px", cursor: "pointer" }} onClick={() => window.open(t.image, "_blank")} />
                        ) : "-"}
                      </td>
                      <td>
                        {t.upi_image ? (
                          <img src={t.upi_image} alt="upi" style={{ width: "60px", cursor: "pointer" }} onClick={() => window.open(t.upi_image, "_blank")} />
                        ) : "-"}
                      </td>
                      <td>{t.status || "-"}</td>
                      <td>{t.state}</td>
                      {/* ─── FIX: show takeover status in table ─────────────── */}
                      <td>
                        <span style={{
                          padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "bold",
                          background: t.takeover ? "#fef3c7" : "#dcfce7",
                          color: t.takeover ? "#92400e" : "#166534",
                        }}>
                          {t.takeover ? "Admin" : "Bot"}
                        </span>
                      </td>
                      <td>{t.created_at ? new Date(t.created_at).toLocaleString() : "-"}</td>
                      <td className="actions">
                        {["REFUNDED", "AUTO_REFUNDED", "RESOLVED", "CLOSED"].map((action) => (
                          <button
                            key={action}
                            onClick={() => handleAction(t.id, action)}
                            disabled={loadingId === t.id}
                          >
                            {loadingId === t.id ? "..." : action.replace("_", " ")}
                          </button>
                        ))}
                        <button onClick={() => { setActiveChat(t); setMessages([]); }}>
                          Chat
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── FEEDBACK VIEW ───────────────────────────────────────────────────── */}
      {view === "feedback" && (
        <table>
          <thead>
            <tr><th>ID</th><th>Phone</th><th>Rating</th><th>Comment</th><th>Date</th></tr>
          </thead>
          <tbody>
            {feedback.map((f) => (
              <tr key={f.id}>
                <td>{f.id}</td>
                <td>{f.phone}</td>
                <td>⭐ {f.rating}/5</td>
                <td>{f.comment}</td>
                <td>{f.created_at ? new Date(f.created_at).toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── PRODUCTS VIEW ───────────────────────────────────────────────────── */}
      {view === "products" && (
        <table>
          <thead>
            <tr><th>ID</th><th>Phone</th><th>Type</th><th>Date</th></tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.phone}</td>
                <td>{p.type}</td>
                <td>{p.created_at ? new Date(p.created_at).toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── ANALYTICS VIEW ──────────────────────────────────────────────────── */}
      {view === "analytics" && (
        <div>
          <h3>Daily Sub Issues</h3>
          <BarChart width={600} height={300} data={analyticsDaily}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" /><YAxis /><Tooltip /><Legend />
            {analyticsDailyKeys.map((key, i) => (
              <Bar key={key} dataKey={key} stackId="subIssues" fill={COLORS[i % COLORS.length]} />
            ))}
          </BarChart>

          <h3>Monthly Trend</h3>
          <LineChart width={600} height={300} data={analyticsMonthly}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" /><YAxis /><Tooltip />
            <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} />
          </LineChart>

          <h3>Issue Breakdown</h3>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "30px" }}>
            <PieChart width={500} height={350}>
              <Pie
                data={selectedIssue === "ALL" ? analyticsCategory : analyticsCategory.filter((i) => i.issue === selectedIssue)}
                dataKey="count" nameKey="issue" outerRadius={120}
              >
                {(selectedIssue === "ALL" ? analyticsCategory : analyticsCategory.filter((i) => i.issue === selectedIssue))
                  .map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(value, name) => [`${value}`, name]} />
            </PieChart>
            <div style={{ minWidth: "280px", maxWidth: "360px" }}>
              <button className={selectedIssue === "ALL" ? "btn red" : "btn red-outline"} onClick={() => setSelectedIssue("ALL")} style={{ marginBottom: "10px" }}>
                All Issues
              </button>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {analyticsCategory.map((item, i) => (
                  <button
                    key={item.issue}
                    className={selectedIssue === item.issue ? "btn red" : "btn red-outline"}
                    onClick={() => setSelectedIssue(item.issue)}
                    style={{ textAlign: "left", whiteSpace: "normal", color: COLORS[i % COLORS.length] }}
                  >
                    {item.issue}: {item.count}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CHAT PANEL ──────────────────────────────────────────────────────── */}
      {activeChat && (
        <div className="chat-panel">
          <div className="chat-header">
            <div>
              <span style={{ fontWeight: "bold" }}>{activeChat.phone}</span>
              {/* ─── FIX: show live takeover status in chat header ─────────── */}
              <span style={{
                marginLeft: "10px", padding: "2px 10px", borderRadius: "10px",
                fontSize: "12px", fontWeight: "bold",
                background: activeChat.takeover ? "#fef3c7" : "#dcfce7",
                color: activeChat.takeover ? "#92400e" : "#166534",
              }}>
                {activeChat.takeover ? "👤 Admin Mode" : "🤖 Bot Mode"}
              </span>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {!activeChat.takeover ? (
                <button
                  onClick={takeover}
                  style={{ background: "#f59e0b", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 12px", cursor: "pointer" }}
                >
                  Take Over
                </button>
              ) : (
                <button
                  onClick={release}
                  style={{ background: "#22c55e", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 12px", cursor: "pointer" }}
                >
                  Release to Bot
                </button>
              )}
              <button
                onClick={() => { setActiveChat(null); setMessages([]); }}
                style={{ background: "#6b7280", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 12px", cursor: "pointer" }}
              >
                Close
              </button>
            </div>
          </div>

          <div className="chat-body">
            {messages.length === 0 && (
              <div style={{ textAlign: "center", color: "#9ca3af", padding: "20px" }}>No messages yet</div>
            )}
            {messages.map((m, idx) => (
              <div
                key={m.id || `${m.created_at}-${idx}`}
                className={m.sender === "admin" ? "msg admin" : m.sender === "bot" ? "msg bot" : "msg user"}
              >
                {/* ─── FIX: field is `message` in DB, not `text` ──────────── */}
                {m.message || m.text || ""}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="chat-input">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              placeholder={activeChat.takeover ? "Type message... (Enter to send)" : "Take over first to send messages"}
              disabled={!activeChat.takeover}
              style={{ opacity: activeChat.takeover ? 1 : 0.5 }}
            />
            <button onClick={sendMessage} disabled={!activeChat.takeover || !chatInput.trim()}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
