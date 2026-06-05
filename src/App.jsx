import { useEffect, useState } from "react";
import axios from "axios";
import "./styles.css";

const API = axios.create({
  baseURL: "https://whatsapp-bot-1x9v.onrender.com",
});

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");

  const [tickets, setTickets] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [products, setProducts] = useState([]);

  const [view, setView] = useState("tickets");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [loadingId, setLoadingId] = useState(null);

  const [sessionExpired, setSessionExpired] = useState(false);

  const login = async () => {
    try {
      const res = await API.post("/login", {
        username: "admin",
        password: "admin",
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

  useEffect(() => {
    if (!token) return;

    fetchTickets();
    fetchFeedback();
    fetchProducts();

    const interval = setInterval(() => {
      if (!token) return;

      fetchTickets();
      fetchFeedback();
      fetchProducts();
    }, 5000);

    return () => clearInterval(interval);
  }, [token]);

  const handleAction = async (id, action) => {
    try {
      setLoadingId(id);

      await API.post(
        "/ticket/action",
        { ticketId: id, action },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      fetchTickets();
    } finally {
      setLoadingId(null);
    }
  };

  const deleteTicket = async (id) => {
    try {
      setLoadingId(id);

      await API.delete(`/tickets/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      fetchTickets();
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
      <div className="login">
        <h2>Snackit Admin</h2>
        <button className="btn red" onClick={login}>
          Login
        </button>
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
          📄 Tickets
        </button>

        <button className="btn red-outline" onClick={() => setView("feedback")}>
          📝 Feedback
        </button>

        <button className="btn red-outline" onClick={() => setView("products")}>
          📦 Products
        </button>

        <button className="btn red-outline" onClick={logout}>
          Logout
        </button>
      </div>

      {/* ================= TICKETS ================= */}
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

                    {/* ✅ ONLY CHANGE: added AUTO_REFUNDED button */}
                    <td>
                      <button onClick={() => handleAction(t.id, "REFUNDED")}>
                        Refund
                      </button>

                      <button onClick={() => handleAction(t.id, "AUTO_REFUNDED")}>
                        Auto Refunded
                      </button>

                      <button onClick={() => handleAction(t.id, "RESOLVED")}>
                        Resolve
                      </button>

                      <button onClick={() => deleteTicket(t.id)}>
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

      {/* FEEDBACK */}
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
                <td>⭐ {f.rating}/5</td>
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

      {/* PRODUCTS */}
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
    </div>
  );
}
