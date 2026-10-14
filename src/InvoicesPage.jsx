/* Invoices: the TRIPNINE invoice maker (booking Excel → invoice in the usual PDF format).
   The page itself lives on the server (invoiceDashboard.html, /invoicing/page) so only people
   with the "Invoices" permission get it; it runs here in a frame and prints from there. */
import { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API = axios.create({ baseURL: "https://whatsapp-bot-backend-b3nb.onrender.com" });

export default function InvoicesPage({ token }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    API.get("/invoicing/page", { headers })
      .then((response) => { if (alive) setHtml(response.data?.html || ""); })
      .catch((err) => { if (alive) setError(err.response?.data?.error || "Could not open the invoice maker. Check your connection and try again."); });
    return () => { alive = false; };
  }, [headers]);
  if (error) return <div className="audit-error">{error}</div>;
  if (!html) return <div className="page-loading" role="status"><span />Loading…</div>;
  return <iframe className="inv-frame" title="Invoice maker" srcDoc={html} />;
}
