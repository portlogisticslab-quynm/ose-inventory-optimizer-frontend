/*
 * OSE Inventory Optimization engine — runs entirely in the browser (no backend).
 * Port of the former FastAPI /api/optimize endpoint (continuous review, lead-time demand).
 *
 *   d          = D / planning_days
 *   S_eff      = Ordering_Cost_S + Transport_Cost_Per_Order + Fixed_Order_Cost
 *   EOQ        = sqrt(2 D S_eff / H), then >= Min_Order_Qty, then <= Max_Order_Qty (if > 0)
 *   mu_LT      = d L
 *   sigma_LT   = sqrt(L sigma_d^2 + d^2 sigma_L^2)
 *   z          = Phi^-1(Service_Level) by Acklam's algorithm, Service_Level clipped to [1e-9, 1 - 1e-9]
 *   SS         = max(0, z sigma_LT),  ROP = mu_LT + SS
 *   IP         = Current_Inventory + On_Order,  Reorder_Now = IP <= ROP
 *   Suggested  = max(Min_Order_Qty, min(EOQ, Capacity - IP)) when reordering
 *                (capacity term only if Capacity > 0, floored at 0); 0 when no reorder
 *   Shortage/yr= sigma_LT G(z) D / EOQ,  G(z) = phi(z) - z (1 - Service_Level)
 *   Costs/yr   : Purchase = D C, Ordering = D/EOQ S_eff, Holding = H (EOQ/2 + SS),
 *                Shortage = p * Shortage/yr
 * Output field names are identical to the old API so app.js and Excel export stay unchanged.
 */
(function (root) {
  "use strict";

  const ENGINE_VERSION = "2.0.0-browser";
  const EPS_P = 1e-9;

  // ---------- Normal distribution helpers ----------

  // Inverse standard normal CDF — P. J. Acklam rational approximation (rel. error < 1.15e-9).
  // Same algorithm as the former backend, so z-values match it bit for bit.
  const A = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const B = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const C = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const Dd = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  function zScore(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    const pLow = 0.02425, pHigh = 1 - pLow;
    let q, r;
    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
        ((((Dd[0] * q + Dd[1]) * q + Dd[2]) * q + Dd[3]) * q + 1);
    }
    if (p <= pHigh) {
      q = p - 0.5; r = q * q;
      return (((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q /
        (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1);
    }
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
      ((((Dd[0] * q + Dd[1]) * q + Dd[2]) * q + Dd[3]) * q + 1);
  }

  const INV_SQRT_2PI = 0.3989422804014327;
  const normPdf = (z) => INV_SQRT_2PI * Math.exp(-0.5 * z * z);
  // Standard normal loss G(z) = phi(z) - z (1 - Phi(z)); as in the former backend, 1 - Phi(z)
  // is taken as 1 - Service_Level as entered (not clipped).
  const lossFn = (z, tail) => normPdf(z) - z * tail;

  // ---------- Model ----------

  const REQUIRED_COLS = ["Item_ID", "Item_Name", "Annual_Demand_D", "Demand_Std_Daily", "LeadTime_Days",
    "LeadTime_Std_Days", "Ordering_Cost_S", "Holding_Cost_H_Year", "Unit_Cost_C", "Shortage_Cost_p",
    "Service_Level", "Current_Inventory", "On_Order", "Min_Order_Qty", "Max_Order_Qty",
    "Capacity_Max_Inventory", "Transport_Cost_Per_Order", "Fixed_Order_Cost"];

  const toNum = (v) => {
    const n = Number(String(v ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  function optimizeItem(row, planningDays) {
    const D = toNum(row.Annual_Demand_D);
    const sd = toNum(row.Demand_Std_Daily);
    const L = toNum(row.LeadTime_Days);
    const sL = toNum(row.LeadTime_Std_Days);
    const S = toNum(row.Ordering_Cost_S) + toNum(row.Transport_Cost_Per_Order) + toNum(row.Fixed_Order_Cost);
    const H = Math.max(toNum(row.Holding_Cost_H_Year), 1e-9);
    const C = toNum(row.Unit_Cost_C);
    const p = toNum(row.Shortage_Cost_p);
    const sl = toNum(row.Service_Level);
    const minQ = toNum(row.Min_Order_Qty);
    const maxQ = toNum(row.Max_Order_Qty);
    const cap = toNum(row.Capacity_Max_Inventory);

    const d = D / planningDays;
    let eoq = Math.sqrt(Math.max(0, 2 * D * S / H));
    eoq = Math.max(eoq, minQ);
    if (maxQ > 0) eoq = Math.min(eoq, maxQ);

    const muLT = d * L;
    const sigmaLT = Math.sqrt(Math.max(0, L * sd * sd + d * d * sL * sL));
    const slc = Math.min(Math.max(sl, EPS_P), 1 - EPS_P);
    const z = zScore(slc);
    const ss = Math.max(0, z * sigmaLT);
    const rop = muLT + ss;
    const ip = toNum(row.Current_Inventory) + toNum(row.On_Order);
    const reorder = ip <= rop;

    let q = 0;
    if (reorder) {
      q = eoq;
      if (cap > 0) q = Math.min(q, Math.max(cap - ip, 0));
      q = Math.max(q, minQ);            // MOQ wins over capacity / Max (same as former backend)
    }

    const cycles = eoq > 0 ? D / eoq : 0;
    const shortUnits = sigmaLT > 0 ? sigmaLT * lossFn(z, 1 - sl) * cycles : 0;
    const purchase = D * C;
    const ordering = cycles * S;
    const holding = H * (eoq / 2 + ss);
    const shortage = p * shortUnits;
    const total = purchase + ordering + holding + shortage;

    return {
      Item_ID: row.Item_ID,
      Item_Name: row.Item_Name,
      Annual_Demand_D: D,
      Daily_Demand: d,
      LeadTime_Days: L,
      Service_Level: sl,
      EOQ: eoq,
      Mean_Demand_During_LT: muLT,
      Std_Demand_During_LT: sigmaLT,
      Z_Service: z,
      Safety_Stock: ss,
      Reorder_Point_ROP: rop,
      Inventory_Position: ip,
      Reorder_Now: reorder,
      Suggested_Order_Qty: q,
      Expected_Shortage_Units_Year: shortUnits,
      Purchase_Cost_Year: purchase,
      Ordering_Cost_Year: ordering,
      Holding_Cost_Year: holding,
      Shortage_Cost_Year: shortage,
      Total_Annual_Cost: total,
      Cost_Per_Unit_Demand: total / Math.max(D, 1e-12),
    };
  }

  function argMax(rows, key) {
    return rows.reduce((best, r) => (r[key] > best[key] ? r : best), rows[0]);
  }

  /** Same contract as the old POST /api/optimize: returns { ok, results, summary, message }. */
  function optimize({ items, planning_days = 365 } = {}) {
    if (!Array.isArray(items) || !items.length) throw new Error("Input table is empty.");
    for (const c of REQUIRED_COLS) if (!(c in items[0])) throw new Error("Missing required column: " + c);
    const days = toNum(planning_days) > 0 ? toNum(planning_days) : 365;

    const results = items.map((r) => optimizeItem(r, days));
    const sum = (k) => results.reduce((s, r) => s + r[k], 0);
    const summary = {
      number_of_items: results.length,
      items_reorder_now: results.filter((r) => r.Reorder_Now).length,
      total_annual_cost: sum("Total_Annual_Cost"),
      purchase_cost: sum("Purchase_Cost_Year"),
      ordering_cost: sum("Ordering_Cost_Year"),
      holding_cost: sum("Holding_Cost_Year"),
      shortage_cost: sum("Shortage_Cost_Year"),
      highest_cost_item: argMax(results, "Total_Annual_Cost"),
      highest_safety_stock_item: argMax(results, "Safety_Stock"),
    };
    return { ok: true, results, summary, message: `Optimization completed for ${results.length} items.` };
  }

  const api = { ENGINE_VERSION, optimize, optimizeItem, zScore, lossFn, REQUIRED_COLS };
  root.InventoryEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
