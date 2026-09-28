/* The refill audit checklist. Failed points become CAPA tasks; Admin Settings uses the same
   list to decide who gets a task the refiller can't do. */

const ALL = ["daily", "weekly", "monthly"];
const WEEKLY_UP = ["weekly", "monthly"];

export const MASTER_CHECKLIST = [
  {
    id: "cat_mechanics",
    title: "Power, mechanics & safety locks",
    items: [
      { id: "power_running", text: "Power supply is stable & machine switched ON running smoothly", maxPts: 10, scopes: ALL, instruction: "Verify stable input without tripping." },
      { id: "safety_locks", text: "Cabinet safety locks, door latch & microswitches functioning securely", maxPts: 10, scopes: WEEKLY_UP, instruction: "Check all deadbolts and key locks." },
      { id: "motor_sound", text: "No abnormal sound from compressor, spiral motors or fan", maxPts: 10, scopes: WEEKLY_UP, instruction: "Listen for grinding or fan rattle." },
      { id: "water_leakage", text: "Zero water leakage inside cabinet; condensation tray intact", maxPts: 10, scopes: ALL, critical: true, instruction: "No water pools or clogged drain pan." },
      { id: "spirals_order", text: "All spirals aligned, timed and running without jamming", maxPts: 10, scopes: ALL, instruction: "Rotate & test spiral cycles if stuck." },
      { id: "dispenser_pickup_ease", text: "Dispenser flap opens freely; dispensed items easy to pick up", maxPts: 10, scopes: ALL, instruction: "Test push flap & anti-theft baffle clearance." },
    ],
  },
  {
    id: "cat_hygiene",
    title: "Cleanliness & hygiene",
    items: [
      { id: "overall_machine_cleanliness", text: "Overall machine cleanliness (cabinet, glass, keypad & surroundings)", maxPts: 10, scopes: ALL, instruction: "Spotless exterior, fingerprint-free glass, sanitised touchpoints." },
      { id: "sponge_cleanliness", text: "Internal trays cleaned with food-grade sponge", maxPts: 10, scopes: ALL, instruction: "Wipe all tray channels and dividers with a damp sanitising sponge." },
      { id: "spill_immediate", text: "Spills on trays, drop chute and dispenser cleaned immediately", maxPts: 10, scopes: ALL, critical: true, instruction: "Clean spills at once to keep hygiene and prevent pests." },
    ],
  },
  {
    id: "cat_fifo",
    title: "FIFO rotation & expiry sweep",
    items: [
      { id: "product_expiry", text: "Product expiry verified (dates, batch numbers, spirals swept)", maxPts: 10, scopes: WEEKLY_UP, critical: true, instruction: "No product expired or within 48 hours of expiry." },
      { id: "fifo_rotation", text: "FIFO rotation followed (older stock in front, fresh at back)", maxPts: 10, scopes: ALL, instruction: "Strict first-in-first-out restocking." },
      { id: "consumables_handling", text: "Hygienic handling of products during restocking", maxPts: 10, scopes: ALL, instruction: "No dropped cartons or surface contamination." },
    ],
  },
  {
    id: "cat_branding",
    title: "Branding, UPI QR & complaint QR",
    items: [
      { id: "vinyl_condition", text: "Branding vinyl properly stuck and in good condition", maxPts: 10, scopes: WEEKLY_UP, instruction: "Check side wraps & front decals for peeling or tears." },
      { id: "qr_placed", text: "Payment / UPI QR sticker placed correctly & clearly legible", maxPts: 10, scopes: ALL, critical: true, instruction: "QR sticker on scanner panel is clean and undamaged." },
      { id: "complaint_qr_working", text: "Customer complaint QR code in place, scannable & working", maxPts: 10, scopes: ALL, critical: true, instruction: "Scan it with a phone; it must open the Snackit helpdesk." },
    ],
  },
];
