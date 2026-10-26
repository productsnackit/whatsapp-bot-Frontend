// Small helpers shared by the company shop pages (ShopView.jsx, ClientPortal.jsx).
export const qtyText = (value) => String(Math.round(Number(value) * 1000) / 1000);
export const longDay = (value) => new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
