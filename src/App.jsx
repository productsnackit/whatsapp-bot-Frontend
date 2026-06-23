import { useEffect, useState } from "react";
import axios from "axios";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import "./styles.css";

const API = axios.create({
  baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com"
});

const COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6"];

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [tickets, setTickets] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [products, setProducts] = useState([]);

  const [analyticsDaily, setAnalyticsDaily] = useState([]);
  const [analyticsDailyKeys, setAnalyticsDailyKeys] = useState([]);
  const [analyticsMonthly, setAnalyticsMonthly] = useState([]);
  const [analyticsCategory, setAnalyticsCategory] = useState([]);
  const [selectedIssue, setSelectedIssue] = useState("ALL");

  const [view, setView] = useState("tickets");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [loadingId, setLoadingId] = useState(null);

  const [sessionExpired, setSessionExpired] = useState(false);

  const login = async () => {
    try {
      const res = await API.post("/login", {
        username,
        password,
      });

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
  };

  const fetchTickets = async () => {
    try {
      const res = await API.get("/tickets", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setTickets(
        Array.isArray(res.data)
          ? res.data.map((t) => ({
              ...t,
              image: t.image || null,
              upi_image: t.upi_image || null,
            }))
          : []
      );

      setSessionExpired(false);
    } catch (err) {
      if (err.response?.status === 401 && !sessionExpired) {
        setSessionExpired(true);
        alert("Session expired. Please login again.");
        logout();
      }
      setTickets([]);
    }
  };

  const fetchFeedback = async () => {
    try {
      const res = await API.get("/feedback", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFeedback(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.log("Feedback error:", err);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await API.get("/product-leads", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProducts(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.log("Product error:", err);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };

      const daily = await API.get("/analytics/product-not-dispensed", { headers });
      const monthly = await API.get("/analytics/monthly", { headers });
      const category = await API.get("/analytics/category", { headers });

      if (Array.isArray(daily.data)) {
        const grouped = {};
        const keys = [];

        daily.data.forEach((x) => {
          const date = x.date ? new Date(x.date).toLocaleDateString() : "-";
          const subIssue = x.sub_issue || "No Sub Issue";
          const count = Number(x.count || 0);

          if (!keys.includes(subIssue)) {
            keys.push(subIssue);
          }

          if (!grouped[date]) {
            grouped[date] = { date };
          }

          grouped[date][subIssue] = count;
        });

        setAnalyticsDaily(Object.values(grouped));
        setAnalyticsDailyKeys(keys);
      } else {
        setAnalyticsDaily([]);
        setAnalyticsDailyKeys([]);
      }

      setAnalyticsMonthly(
        Array.isArray(monthly.data)
          ? monthly.data.map((x) => ({
              month: x.month
                ? new Date(x.month).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })
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
  };

  useEffect(() => {
    if (!token) return;

    fetchTickets();
    fetchFeedback();
    fetchProducts();
    fetchAnalytics();

    const interval = setInterval(() => {
      if (!token) return;

      fetchTickets();
      fetchFeedback();
      fetchProducts();
      fetchAnalytics();
    }, 5000);

    return () => clearInterval(interval);
  }, [token]);

 const handleAction = async (id, action) => {
  try {
    setLoadingId(id);

    await API.post(
  "https://whatsapp-bot-backend-b3nb.onrender.com/ticket/action",
  { ticketId: id, action },
  { headers: { Authorization: `Bearer ${token}` } }
);

    // ✅ ADD THIS LINE (MESSAGE FOR ADMIN)
    alert(`Action "${action}" completed successfully`);

    fetchTickets();
  } catch (err) {
    // ✅ ADD ERROR MESSAGE
    alert("Action failed. Check backend.");
    console.log(err);
  } finally {
    setLoadingId(null);
  }
};

  const filteredTickets = tickets.filter((t) => {
    const s = search.toLowerCase();
    const upi = (t.upi_id || "").toLowerCase();

    const matchSearch =
      t.phone?.toLowerCase().includes(s) ||
      upi.includes(s) ||
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

  if (!token) {
    return (
      <div style={{ display: "flex", height: "100vh" }}>
        {/* LEFT SIDE IMAGE */}
        <div style={{ flex: 1 }}>
          <img
            src="/login.png"
            alt="Snackit"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </div>

        {/* RIGHT SIDE LOGIN */}
        <div
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            background: "#fff",
          }}
        >
          <div
            style={{
              width: "320px",
              padding: "40px",
              borderRadius: "12px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
              textAlign: "center",
            }}
          >
            <h2 style={{ color: "#ef4444", marginBottom: "20px" }}>
              Admin Login
            </h2>

            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                marginBottom: "15px",
                borderRadius: "8px",
                border: "1px solid #ddd",
                outline: "none",
              }}
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                marginBottom: "20px",
                borderRadius: "8px",
                border: "1px solid #ddd",
                outline: "none",
              }}
            />

            <button
              onClick={login}
              style={{
                width: "100%",
                padding: "12px",
                background: "#ef4444",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontWeight: "bold",
                cursor: "pointer",
                transition: "0.3s",
              }}
              onMouseOver={(e) => (e.target.style.background = "#dc2626")}
              onMouseOut={(e) => (e.target.style.background = "#ef4444")}
            >
              Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <img src="/logo.png" alt="logo" />
        <h2>Snackit Dashboard</h2>
      </div>

      <div className="controls">
        <button className="btn red" onClick={() => setView("tickets")}>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6z" stroke="currentColor" strokeWidth="2"/>
  </svg>
  Tickets
</button>

        <button className="btn red-outline" onClick={() => setView("feedback")}>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8z" stroke="currentColor" strokeWidth="2"/>
  </svg>
  Feedback
</button>

        <button className="btn red-outline" onClick={() => setView("products")}>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" strokeWidth="2"/>
  </svg>
  Products
</button>

       <button className="btn red-outline" onClick={() => setView("analytics")}>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="2"/>
  </svg>
  Analytics
</button>

        <button className="btn red-outline" onClick={logout}>
          Logout
        </button>
      </div>

      {view === "tickets" && (
        <>
          <div className="controls">
            <input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select onChange={(e) => setFilter(e.target.value)}>
              <option value="">All</option>
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
              <option value="refunded">Refunded</option>
              <option value="auto_refunded">Auto Refunded</option>
              <option value="resolved">Resolved</option>
            </select>

            <button className="btn red" onClick={fetchTickets}>
              Refresh
            </button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Phone</th>
                  <th>Main</th>
                  <th>Sub</th>
                  <th>Issue</th>
                  <th>Location</th>
                  <th>UPI</th>
                  <th>Image</th>
                  <th>UPI Screenshot</th>
                  <th>Status</th>
                  <th>State</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredTickets.map((t, i) => (
                  <tr key={t.id}>
                    <td>{i + 1}</td>
                    <td>{t.phone}</td>
                    <td>{t.main_issue || "-"}</td>
                    <td>{t.sub_issue || "-"}</td>
                    <td>{t.issue || "-"}</td>
                    <td>{t.location || "-"}</td>
                    <td>{t.upi_id || "-"}</td>

                    <td>
                      {t.image ? (
                        <img
                          src={t.image}
                          alt="img"
                          style={{ width: "60px", cursor: "pointer" }}
                          onClick={() => window.open(t.image, "_blank")}
                        />
                      ) : (
                        "-"
                      )}
                    </td>

                    <td>
                      {t.upi_image ? (
                        <img
                          src={t.upi_image}
                          alt="upi"
                          style={{ width: "60px", cursor: "pointer" }}
                          onClick={() => window.open(t.upi_image, "_blank")}
                        />
                      ) : (
                        "-"
                      )}
                    </td>

                    <td>{t.status || "-"}</td>
                    <td>{t.state}</td>
                    <td>
                      {t.created_at
                        ? new Date(t.created_at).toLocaleString()
                        : "-"}
                    </td>

                    {/* UPDATED ONLY HERE */}
                    <td className="actions">
                      <button
                        className="btn red-outline"
                        onClick={() => handleAction(t.id, "REFUNDED")}
                      >
                        Refund
                      </button>

                      <button
                        className="btn red"
                        onClick={() => handleAction(t.id, "AUTO_REFUNDED")}
                      >
                        Auto Refunded
                      </button>

                      <button
                        className="btn red-outline"
                        onClick={() => handleAction(t.id, "RESOLVED")}
                      >
                        Resolve
                      </button>

                      <button
                        className="btn red-outline"
                        onClick={() => deleteTicket(t.id)}
                      >
                        Close
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === "feedback" && (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Phone</th>
              <th>Rating</th>
              <th>Comment</th>
              <th>Date</th>
            </tr>
          </thead>

          <tbody>
            {feedback.map((f) => (
              <tr key={f.id}>
                <td>{f.id}</td>
                <td>{f.phone}</td>
                <td>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l3 7 7 .5-5.5 4.5 2 7L12 17l-6.5 4 2-7L2 9.5 9 9l3-7z"/>
  </svg>
  {f.rating}/5
</td>
                <td>{f.comment}</td>
                <td>
                  {f.created_at
                    ? new Date(f.created_at).toLocaleString()
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {view === "products" && (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Phone</th>
              <th>Type</th>
              <th>Date</th>
            </tr>
          </thead>

          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.phone}</td>
                <td>{p.type}</td>
                <td>
                  {p.created_at
                    ? new Date(p.created_at).toLocaleString()
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {view === "analytics" && (
       
        <div>
          <h3>Daily Sub Issues</h3>
          <BarChart width={600} height={300} data={analyticsDaily}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            {analyticsDailyKeys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="subIssues"
                fill={COLORS[i % COLORS.length]}
              />
            ))}
          </BarChart>

          <h3>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M3 17l6-6 4 4 7-7" stroke="currentColor" strokeWidth="2"/>
  </svg>
  Monthly Trend
</h3>
          <LineChart width={600} height={300} data={analyticsMonthly}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} />
          </LineChart>

          <h3>Issue Breakdown</h3>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "30px" }}>
            <PieChart width={500} height={350}>
              <Pie
                data={
                  selectedIssue === "ALL"
                    ? analyticsCategory
                    : analyticsCategory.filter((item) => item.issue === selectedIssue)
                }
                dataKey="count"
                nameKey="issue"
                outerRadius={120}
              >
                {(selectedIssue === "ALL"
                  ? analyticsCategory
                  : analyticsCategory.filter((item) => item.issue === selectedIssue)
                ).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>

              <Tooltip formatter={(value, name) => [`${value}`, name]} />
            </PieChart>

            <div style={{ minWidth: "280px", maxWidth: "360px" }}>
              <button
                className={selectedIssue === "ALL" ? "btn red" : "btn red-outline"}
                onClick={() => setSelectedIssue("ALL")}
                style={{ marginBottom: "10px" }}
              >
                All Issues
              </button>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {analyticsCategory.map((item, i) => (
                  <button
                    key={item.issue}
                    className={selectedIssue === item.issue ? "btn red" : "btn red-outline"}
                    onClick={() => setSelectedIssue(item.issue)}
                    style={{
                      textAlign: "left",
                      whiteSpace: "normal",
                      color: COLORS[i % COLORS.length],
                    }}
                  >
                    {item.issue}: {item.count}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}