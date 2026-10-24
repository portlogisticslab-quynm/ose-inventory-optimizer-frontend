# OSE Inventory Optimization with Lead Time (frontend-only)

Static site: the optimization runs in the browser (`js/inventory-engine.js`), no backend.

- `index.html`, `js/app.js` — UI (Excel template / import / edit / run / export, charts)
- `js/inventory-engine.js` — port of the former FastAPI `/api/optimize` (same field names and results):
  - `S_eff = S + Transport_Cost_Per_Order + Fixed_Order_Cost`, `EOQ = sqrt(2·D·S_eff/H)`, then ≥ MOQ, ≤ Max (if > 0)
  - `σ_LT = sqrt(L·σd² + d²·σL²)`, `z = Φ⁻¹(SL)` (Acklam, SL clipped to [1e-9, 1−1e-9]), `SS = max(0, z·σ_LT)`, `ROP = d·L + SS`
  - `Reorder_Now = IP ≤ ROP`; `Suggested = max(MOQ, min(EOQ, Capacity − IP))` (capacity only if > 0)
  - Shortage/yr `= σ_LT·(φ(z) − z·(1−SL))·D/EOQ`; costs: purchase, ordering, holding `H·(EOQ/2+SS)`, shortage
  - Verified against the old backend on 520 SKUs (demo, edge cases, random): max relative difference ≤ 1e-9
- Deploy: Cloudflare Pages, build command `exit 0`, output `.`
