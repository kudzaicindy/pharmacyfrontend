# Admin dashboard & ranking — backend specification (for MediConnect / MediBot)

This document describes what the **pharmacy admin (MediBot) dashboard** in the frontend expects from the API, how **patient-side ranking** is triggered, and what **calculations** the backend should own so the UI can show real data instead of placeholders or client-side estimates.

**Audience:** backend engineers implementing or extending Django (or other) APIs under `/api/chatbot/admin/…` and request ranking.

---

## 1. High-level architecture

| Concern | Where it lives today (frontend) | Should be computed by |
|--------|----------------------------------|------------------------|
| **Patient request ranking** (ordered pharmacy offers) | `GET …/request/{id}/ranked/` | **Backend** — authoritative MCDA / scoring for a given request |
| **Pharmacy portal “My ranking score”** (0–100 + bars) | Mostly **client-derived** from requests, inventory, optional `pharmacy.*` fields | **Backend** recommended — same definitions as ranking, exposed per pharmacy |
| **Admin MediBot layers 1–5** (health, governance, algorithm, impact, AI safety) | `GET …/admin/overview/medi-bot/` with fallbacks + **demo data** when missing | **Backend** — single consolidated snapshot |
| **Algorithm weights & profiles** (rural / shortage / affordability) | **Admin UI** stores drafts in `localStorage`; overview reads `layer3` if present | **Backend** — persist, validate sum to 100%, audit changes |
| **Verification queue / watchlist** | Normalized from `layer2` or pharmacy list | **Backend** |

---

## 2. Main API endpoints (frontend)

| Method | Path (relative to API base, e.g. `/api/chatbot`) | Used for |
|--------|---------------------------------------------------|----------|
| `GET` | `/admin/dashboard/data/?limit=100` | Lists: pharmacies, pharmacists, patient_requests, reservations; `overview`, `breakdown`, optional `registry` |
| `GET` | `/admin/overview/medi-bot/` | MediBot consolidated overview (layers, widgets, badges, alerts) |
| `GET` | `/admin/analytics/search-volume/` | Search volume chart (optional) |
| `GET` | `/admin/analytics/geo-heatmap/?days=30` | Region request counts (+ optional lat/lon centroids per bucket) |
| `GET` | `/admin/audit/logs/` | Audit log tab |
| `GET` | `/admin/users/`, `/admin/patients-list/`, etc. | Platform tabs |
| `GET` | `/request/{requestId}/ranked/?conversation_id=…&limit=3` | **Patient chat** — ranked pharmacy responses |

Auth: admin routes use **session/credentials** (`credentials: 'include'`). Ranked responses require `conversation_id` for security.

---

## 3. MediBot overview: `GET /admin/overview/medi-bot/`

The frontend treats the response as a **single JSON object**. Recommended top-level fields:

| Field | Type | Purpose |
|-------|------|---------|
| `generated_at` | ISO datetime | Shown as “Snapshot: …” on admin overview |
| `open_alerts_count` | number | Optional; drives alert styling if present |
| `nav_badges` | object | Sidebar badges: `verification_queue`, `watchlist`, `chatbot_audit` (snake_case or camelCase) |
| `layer1_system_health` | object | Layer 1 — system / geography / SLA |
| `layer2_pharmacy_governance` | object | Layer 2 — verification queue, watchlist, aggregates |
| `layer3_algorithm` | object | Layer 3 — standard weights, context profiles, active profile |
| `layer4_impact` | object | Layer 4 — fulfilment, equity, transport estimates |
| `layer5_ai_safety` | object | Layer 5 — flagged chatbot preview, safety policies |
| `widgets` | object | Optional: `search_volume`, `pharmacy_match_rates`, `recent_registrations`, `system_alerts` |

These keys match `MediBotOverviewSections.jsx` (`layer1_system_health`, `layer2_pharmacy_governance`, `layer3_algorithm`, `layer4_impact`, `layer5_ai_safety`).

### 3.1 Layer 1 — `layer1_system_health` (examples)

Fields the frontend already understands (aliases in parentheses):

- `active_users`, `requests_today`, `requests_last_hour`
- `avg_response_time_ms` or `avg_response_seconds`
- `uptime_pct_this_month` or `uptime_percent`
- `pharmacy_counts`: e.g. `{ registered, total }`
- `request_volume_by_city`: array of `{ key, label, city?, volume|count, kind?, rural_share?, emoji? }`
- `sla_by_region`: array of `{ label, region?, seconds|avg_seconds|latency_seconds, tier?, suffix?, is_rural? }`
- Optional copy: `sla_narrative`, `active_users_peak_label`, `response_targets_label`, `uptime_incident_label`

#### Volume by city — **not** a separate GIS service

Regional “volume” is **request counts grouped by a text bucket**, not a live map service.

1. **Region assignment** (`chatbot/admin_analytics.py`): `geo_region_key(suburb, address)` lowercases `MedicineRequest.location_suburb` and `location_address`, then matches **substring keywords** in **`ZW_GEO_BUCKETS`** (e.g. `harare`, `bulawayo`, `hwange`). If nothing matches → bucket **`other`**.

2. **Count builders**
   - **`build_geo_heatmap(days)`** — loads `MedicineRequest` rows in the time window, assigns `geo_region_key` per row, aggregates counts per key (and may attach optional lat/lon centroids).
   - **`build_city_volume_cards(days, sla_by_key=...)`** — uses a **fixed card order** (Harare, Bulawayo, Mutare, Hwange, Gweru, Other), enriches rows with **`CITY_CARD_META`** (label, emoji, zone), sets **`volume`** from counts, and can attach **`p95_response_ms`** per city when an SLA map is supplied.

3. **Where it appears in the API**
   - **`GET /admin/overview/medi-bot/`** → `layer1_system_health.request_volume_by_city` (frontend aliases may expose `key`, `count`, `city`, etc.).
   - **`GET /admin/analytics/geo-heatmap/?days=30`** → `{ "heatmap": [ { "geo_region", "count", "latitude?", "longitude?" }, ... ] }`.

4. **Limits / data quality**
   - Accuracy depends on **suburb and address text** (and the keyword list). Requests with coordinates only and **no** place name often end up in **`other`**.
   - Improvements: normalize **`location_suburb`** at create time; reverse-geocode once and persist **`geo_region`**; expand **`ZW_GEO_BUCKETS`**; or use a proper admin-boundary dataset.

SLA-by-region rows should still follow your urban/rural targets (e.g. &lt;2s urban / &lt;5s rural) where those metrics are computed separately from the text bucket.

### 3.2 Layer 2 — `layer2_pharmacy_governance`

- `verification_queue`: array **or** wrapped in `{ results | items | data | pharmacies }` (see `normalizeVerificationQueue` in `src/utils/pharmacyRegistryStatus.js`).  
  Item fields used: `id|pharmacy_id`, `name|pharmacy_name`, `license_number|licence_number|lic`, `submitted_at|created_at`, `address|meta|location`
- `watchlist`: array of `{ id|pharmacy_id, title|name|pharmacy_name, body|summary|detail, tone|severity, … }`
- `awaiting_response_preview`: array of short lines for dashboard preview
- `aggregates`: optional object for counts/copy

### 3.3 Layer 3 — `layer3_algorithm` (ranking weights)

Used for **admin visibility**, not for replacing server-side ranking unless you also apply these in code.

- `standard_weights` object — any of these key styles (numbers should sum to **100**):

  ```json
  {
    "price": 30,
    "distance": 35,
    "rating": 20,
    "stock": 15
  }
  ```

  Aliases accepted: `price_pct`, `price_competitiveness`, `distance_pct`, `travel`, `rating_pct`, `patient_rating`, `stock_pct`, `stock_reliability`.

- `context_profiles`: array of profiles, e.g.

  ```json
  {
    "key": "rural",
    "label": "Rural equity",
    "weights": { "price": 25, "distance": 20, "rating": 25, "stock": 30 },
    "weights_pct": [25, 20, 25, 30],
    "active": false
  }
  ```

- `active_ranking_profile` or `active_profile`: string key/slug matching a profile.

**Frontend defaults** if `standard_weights` is missing: price 30, distance 35, rating 20, stock 15.

**Admin “Algorithm stewardship” tab** also has **local presets** (default / rural / shortage / affordability) in `AdminCommandCenter.jsx` — these are **not** sent to the server until you add PATCH/POST endpoints. Backend should eventually be the **source of truth** and return them via `layer3`.

### 3.4 Layer 4 — `layer4_impact`

Examples:

- `weekly_urban_rural_fulfilment` or `weekly_fulfilment_series`: `[{ label|week, urban|urban_pct, rural|rural_pct }]`
- `median_find_time_display` or `median_find_time_minutes`
- `fulfilment_pct`, `fulfilment_done`, `fulfilment_total`, `fulfilment_counts_label`
- `transport_savings_estimate`, `equity_gap_pct`, `urban_fulfilment_pct`, `rural_fulfilment_pct`, `equity_snapshot` object, `equity_narrative`

### 3.5 Layer 5 — `layer5_ai_safety`

- `flagged_preview`: array of `{ question|summary|title, when|created_at, response|bot_reply, tone, actions[] }`
- `safety_policies` or `chatbot_policy`: booleans e.g. `disclaimer`, `dosage`, `paediatric`, `emergency`, `rx_flag` / camelCase variants (see `mapSafetyPoliciesToUi` in `MediBotOverviewSections.jsx`)

### 3.6 Widgets (optional)

- `widgets.search_volume` — time series for charts  
- `widgets.pharmacy_match_rates`, `recent_registrations`, `system_alerts` — lists for overview cards  

Shape is loosely coupled; inspect `AdminDashboard.jsx` for the exact branches.

### 3.7 Search volume analytics — `GET /admin/analytics/search-volume/?days=30`

Used by **`getAdminSearchVolumeAnalytics(days)`** and merged with **`widgets.search_volume`** on the admin overview. **Precedence:** for `requests_by_day`, `top_medicines`, and `top_regions`, the **search-volume endpoint** wins whenever it returns a **non-empty** array; the widget is only a fallback. Numeric totals (`total_requests_in_window`, `zero_result_*`) prefer the endpoint when those numbers are finite, otherwise the widget. This avoids stale MediBot widget data (e.g. a single “Other” row with the full window count) overriding the dedicated analytics response.

**Query:** `days` — window length (frontend clamps to 1–90; dashboard fetch currently uses **30**).

**Response shape (observed / supported):**

| Field | Type | Notes |
|-------|------|--------|
| `days` | number | Echo of window |
| `requests_by_day` | `[{ date, count }]` | ISO `date` (`YYYY-MM-DD`); aliases `by_day` accepted in merge |
| `top_medicines` | `[{ medicine, count }]` | Aliases `top_searches`, item keys `name` / `label` / `query` accepted when mapping rows |
| `top_regions` | `[{ region, count, label? }]` | Shown as “Top regions”. Prefer human **`region`** values aligned with Layer 1 buckets (e.g. `"Harare"`, `"Other"`). Optional **`label`** / **`geo_region`** / **`city`** override display when present. |
| `total_requests_in_window` | number | Shown in overview metrics |
| `zero_result_requests` | number | Searches/requests with no useful match |
| `zero_result_rate` | number | e.g. `0.225806` — displayed as a percentage when finite |

**Example (canonical):** `top_regions`: `[{ "region": "Harare", "count": 30 }, { "region": "Other", "count": 1 }]` with `total_requests_in_window` matching the sum of regional counts when every request is bucketed.

**Frontend:** When `top_regions` is non-empty, the admin **MediBot overview** “Request volume by city” cards and **Layer 1 → Geographic demand** heatmap use this array (via `cityRowsFromSearchVolumeTopRegions` in `src/utils/adminSearchVolumeUi.js`), ahead of `layer1_system_health.request_volume_by_city` or client-side request counting. **`top_medicines`** feeds the overview “Top searched medicines” panel and Layer 1’s “Top searched medicines” list the same way.

**Legacy / avoid:** If **`region`** is a short numeric string (e.g. `"31.0533"`), it was likely a truncated coordinate key; the frontend may map common Zimbabwe longitude bands to a city **label for display only** — still better to send **`region`** as the same string you use in **`request_volume_by_city`** / **`geo_region_key`** (e.g. `harare` / `Harare`).

---

## 4. Patient-side ranking: `GET /request/{requestId}/ranked/`

**Purpose:** Return pharmacies (or offers) **sorted by score** for a specific medicine request, with `conversation_id` scoping.

**Backend responsibilities:**

1. Load candidate pharmacies (eligible, in area, stock/price rules, etc.).
2. For each candidate, compute **criteria scores** (at minimum aligned with admin weights):
   - Price competitiveness (vs median or basket for that medicine/area)
   - Distance / travel time from patient context
   - Patient rating (aggregated, verified transactions if possible)
   - Stock reliability (historical accuracy, reservation success)
3. Apply **profile** (default vs rural vs shortage vs affordability) if request/context flags require it.
4. Normalize criteria to comparable scales (e.g. 0–1), multiply by weights, sum → **total score**.
5. Sort descending; return top `limit` (default 3).

**Contract:** Default response remains a **JSON array**. With query `envelope=true` (`1` / `yes`), backend may return `{ results, items, count, meta }`. The frontend `getRankedResponses()` normalizes envelopes into `pharmacy_responses` / `responses` alongside raw fields; `Chatbot.jsx` also reads `results` / `items`. Pass `{ envelope: true }` as the fourth argument to `getRankedResponses` when you want `meta` (e.g. scoring note). Each item should include whatever the chat UI needs: pharmacy id, name, price, distance, badges, etc.

---

## 5. Pharmacy portal ranking (not admin, but same math)

**Implemented backend:** `GET /api/chatbot/pharmacist/{pharmacist_id}/ranking-summary/`

**Frontend:** `getPharmacistRankingSummary(pharmacistId)` in `src/utils/api.js`. `PharmacyDashboard` loads it on login and prefers these fields for the overview ranking card; falls back to local derivation if the call fails.

Response fields (expected):

- `ranking_score_0_100` — backend composite (aligned with \(0.3P + 0.2R + 0.15S + 0.2T\) when using same inputs)
- `price_competitiveness_pct`, `response_rate_pct`, `stock_reliability_pct`, `patient_rating_pct` (0–100)
- **`response_rate_pct` (reliability / R)** — should match the **computed** activity-based match rate used in admin analytics and patient MCDA when possible: opportunities within the configured radius/window (e.g. **50 km / 90 days**) with valid coordinates; if there are no qualifying opportunities or coords are missing/invalid, fall back to stored **`Pharmacy.response_rate`** (or safe dashboard defaults). Same bulk helper as ranking (`compute_effective_pharmacy_response_rates_for_ids`) keeps portal, dashboard, and **`get_ranked_pharmacy_responses`** aligned.
- `leaderboard_rank`, `leaderboard_total`, `leaderboard_area`, `leaderboard_area_key`
- `definitions` — optional human-readable blurbs per factor

**Patient ranked search:** `get_ranked_pharmacy_responses` should attach the per-pharmacy **computed** rate (e.g. `pharmacy_response_rate`) so **MCDA reliability** uses that value, not the raw DB column alone; the returned **`ranking_score`** on each row is the weighted composite (price / distance / rating / reliability).

**Fallbacks** when the summary is missing: \(P\) defaults to **84**; \(R\), \(S\), \(T\) from `pharmacy` + requests + inventory as before. Embedded `pharmacy.leaderboard_*` is still honored if summary has no leaderboard.

### Pharmacist reservations (`GET /api/chatbot/pharmacist/reservations/`)

- **`scope=active`** (default): only **pending** / **confirmed** with **`expires_at` &gt; now** — can be **empty** when nothing is in the pickup window or everything is completed/expired/cancelled.
- **`scope=recent`**: last **`limit`** rows (default **50**, max **200**) for this pharmacy, **any** status, newest first — used by the **pharmacy portal** for fulfilment history and earnings (`PharmacyDashboard` requests `scope=recent&limit=200`).
- Response may include **`scope`**, **`pharmacy_id`**, and **`reservations`** so the client knows which mode ran.
- **`include_meta=1`** (optional): response may include **`meta`** with **`total_reservations`**, **`by_status`** counts, **`active_non_expired_pending_or_confirmed`**, and a **`hint`** when the list is empty (e.g. suggest `scope=recent` or no rows yet). The portal passes this on reservation fetches and shows **`hint`** in the fulfilment log empty state.

---

## 6. Admin bundle: `GET /admin/dashboard/data/`

Expected shape (flexible lists):

- `overview` — counts, uptime, response times, etc. (many optional keys; frontend tries several spellings). May include **`overview.pharmacy_registry_counts`**: `{ total_registered, verified, pending_review, suspended }`
- `breakdown.requests_by_status` — status → count
- `lists.pharmacies`, `lists.pharmacists`, `lists.patient_requests`, `lists.reservations`
- `registry.summary` or `breakdown.pharmacy_registry` — verified / pending / suspended counts

Pharmacy rows should expose **`is_verified`**, **`account_status`** (`active` / `pending` / `suspended`), and fields compatible with `getPharmacyRegistryStatus()` (`status`, `verification_status`, etc.) so verification counts and filters match.

---

## 7. Suggested backend delivery checklist

1. **Ranked list API** — document scoring function, weights, profiles, and audit log when weights change.
2. **MediBot overview** — implement `layer1`–`layer5` + `widgets` + `nav_badges` + `generated_at`.
3. **Persist algorithm config** — CRUD for `standard_weights` and `context_profiles`; enforce sum-to-100; version configs.
4. **Pharmacy ranking summary** — expose breakdown + leaderboard position by region.
5. **Verification queue** — dedicated query or embedded list; stable IDs and timestamps.
6. **Watchlist** — rule-based (low response rate, complaints, price mismatch) with structured rows for the admin UI.

---

## 8. File references (frontend)

| Area | File(s) |
|------|---------|
| MediBot nav tabs | `src/utils/adminNavSections.js` |
| Admin data fetch | `src/pages/AdminDashboard.jsx`, `src/utils/api.js` |
| Layer 1 tab | `src/components/admin/AdminMediBotTabViews.jsx` (`layer1_system_health`) |
| Overview sections & layer2–5 parsing | `src/components/admin/MediBotOverviewSections.jsx` |
| Algorithm stewardship UI (localStorage mocks) | `src/components/admin/AdminCommandCenter.jsx` |
| Verification queue normalization | `src/utils/pharmacyRegistryStatus.js` |
| Pharmacy score & leaderboard fields | `src/pages/PharmacyDashboard.jsx` (`overviewMetrics` useMemo) |
| Patient ranked responses | `src/utils/api.js` → `getRankedResponses` |

---

*Generated from the pharmacyfrontend codebase for handoff to backend. Update this doc when API shapes are finalized.*
