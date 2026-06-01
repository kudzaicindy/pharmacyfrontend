# Pharmacy portal settings — backend contract

The pharmacy **Settings** tab (`PharmacyDashboard.jsx`) has six sections. Today only **Security → 2FA** calls the API (when routes exist). Everything else saves to **`localStorage`** only or shows a demo toast — changes are **lost on another device** and **not visible to patients**.

Once you implement the endpoints below, the frontend will wire **GET on load** + **PATCH on Save** per section.

Base URL prefix: `/api/chatbot/`  
Auth: **`Authorization: Bearer <token>`** from `POST /pharmacist/login/` (same as MFA routes).

Query/body must include **`pharmacist_id`** (UUID from login) on every call.

---

## Recommended shape: one settings resource

Simplest for the frontend:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/pharmacist/settings/?pharmacist_id={id}` | Load all sections |
| `PATCH` | `/pharmacist/settings/?pharmacist_id={id}` | Partial update (only keys sent) |

Alternative: split into `GET/PATCH /pharmacy/{pharmacy_id}/` (profile + service) and `GET/PATCH /pharmacist/{pharmacist_id}/preferences/` (operations + notifications). The frontend can call either pattern.

### Example `GET` response (200)

```json
{
  "pharmacist_id": "uuid",
  "pharmacy_id": "uuid",
  "profile": {
    "name": "HealthFirst Pharmacy",
    "display_name": "HealthFirst",
    "license_number": "PCZ-12345",
    "tax_number": "",
    "address": "12 Samora Machel Ave, Harare",
    "phone": "+263771234567",
    "whatsapp": "+263771234567",
    "email": "info@healthfirst.co.zw",
    "website": "https://healthfirst.co.zw",
    "description": "Open late, parking available.",
    "verification_status": "verified",
    "verified_at": "2026-01-15T10:00:00Z"
  },
  "operations": {
    "opening_hours_text": "Mon–Fri 08:00–18:00, Sat 09:00–13:00",
    "weekday_open": "08:00",
    "weekday_close": "18:00",
    "holiday_notes": "",
    "accepting_requests": true,
    "auto_suggest_shift_on_open": true,
    "pause_requests_outside_hours": false,
    "hide_zero_quantity_in_search": true,
    "email_on_low_stock": false
  },
  "notifications": {
    "email_enabled": true,
    "sms_enabled": false,
    "browser_push_enabled": true,
    "alert_new_requests": true,
    "alert_reservations": true,
    "alert_reservation_expiring": true,
    "alert_low_stock_digest": false,
    "alert_ranking_changes": false,
    "alert_weekly_summary": false,
    "alert_product_updates": false,
    "digest_frequency": "weekly",
    "quiet_hours_start": "22:00",
    "quiet_hours_end": "07:00"
  },
  "service": {
    "pickup_enabled": true,
    "delivery_enabled": false,
    "max_service_radius_km": 15,
    "typical_prep_minutes": 30,
    "service_areas_text": "CBD, Avondale, Borrowdale",
    "delivery_notes": "ID required on collection."
  },
  "updated_at": "2026-05-24T12:00:00Z"
}
```

`PATCH` body: same nested objects with **only fields being changed**. Return the full document (or `{ message, settings }` with the same shape).

---

## Section-by-section (UI → fields)

### 1. Profile (`profile`)

| UI label | JSON key | Notes |
|----------|----------|--------|
| Pharmacy name | `name` | Legal name |
| Trading / display name | `display_name` | Optional |
| License / registration no. | `license_number` | |
| Tax / VAT number | `tax_number` | Optional |
| Street address | `address` | Shown to patients / directions |
| Phone (main) | `phone` | |
| WhatsApp | `whatsapp` | Optional |
| Email | `email` | |
| Website | `website` | Optional URL |
| Public description | `description` | Max ~300 chars |
| Verified (read-only) | `verification_status` | `pending` \| `verified` \| `suspended` — **not** writable by pharmacist |

**Validation:** 400 with `{ "error": "…", "fields": { "description": ["too long"] } } }`.

**Side effect:** Updating address/phone should refresh patient-facing pharmacy rows on the next ranked/search response.

---

### 2. Operations (`operations`)

| UI label | JSON key | Notes |
|----------|----------|--------|
| Regular opening hours | `opening_hours_text` | Free text |
| Default weekday open | `weekday_open` | `"HH:MM"` 24h |
| Default weekday close | `weekday_close` | `"HH:MM"` |
| Holiday / closure notes | `holiday_notes` | Optional |
| Accepting requests (top bar) | `accepting_requests` | **Critical** — when `false`, backend should stop assigning new patient requests to this pharmacy |
| Auto-suggest shift on open | `auto_suggest_shift_on_open` | UI hint only unless you implement |
| Pause outside hours | `pause_requests_outside_hours` | If true + outside hours → treat as not accepting |
| Hide zero qty in search | `hide_zero_quantity_in_search` | Inventory/search behaviour |
| Email on low stock | `email_on_low_stock` | Requires notifications email |

**Dedicated shortcut (optional):**

`PATCH /pharmacist/settings/?pharmacist_id=` with `{ "operations": { "accepting_requests": false } }`  
so the top-bar toggle can sync without saving the whole form.

---

### 3. Notifications (`notifications`)

All booleans unless noted.

| JSON key | UI |
|----------|-----|
| `email_enabled` | Email to pharmacy address |
| `sms_enabled` | SMS to main phone |
| `browser_push_enabled` | Browser push (portal open) |
| `alert_new_requests` | New live patient requests |
| `alert_reservations` | Reservation created / confirmed / completed |
| `alert_reservation_expiring` | Reservation expiring soon |
| `alert_low_stock_digest` | Daily low / out-of-stock digest |
| `alert_ranking_changes` | Ranking or score changes |
| `alert_weekly_summary` | Weekly performance summary |
| `alert_product_updates` | Product updates from MediConnect |
| `digest_frequency` | `off` \| `daily` \| `weekly` |
| `quiet_hours_start` | `"HH:MM"` |
| `quiet_hours_end` | `"HH:MM"` |

Backend should respect quiet hours for **non-urgent** email/SMS; urgent new requests may still notify (document your policy in API).

---

### 4. Service area (`service`)

| JSON key | UI |
|----------|-----|
| `pickup_enabled` | In-store pickup |
| `delivery_enabled` | Delivery to patient address |
| `max_service_radius_km` | number 1–200 |
| `typical_prep_minutes` | number, used in response ETA hints |
| `service_areas_text` | Areas / suburbs covered |
| `delivery_notes` | Fees, minimum order, ID on collection |

Used for distance ranking / patient messaging when you support it.

---

### 5. Security

#### Password change

| Method | Path | Body |
|--------|------|------|
| `POST` | `/pharmacist/password/change/` | `{ "pharmacist_id", "current_password", "new_password" }` |

- `new_password` min length 8.
- 401 wrong current password; 400 validation errors.

(Or reuse `/auth/password-reset/…` only for forgot-password — the settings UI expects **logged-in change**.)

#### Two-step authentication (already in frontend)

| Method | Path |
|--------|------|
| `GET` | `/pharmacist/mfa/status/?pharmacist_id=` |
| `POST` | `/pharmacist/mfa/setup/start/` → `{ pharmacist_id }` → `{ otpauth_uri, secret? }` |
| `POST` | `/pharmacist/mfa/setup/confirm/` → `{ pharmacist_id, otp_code }` |
| `POST` | `/pharmacist/mfa/disable/` → `{ pharmacist_id, otp_code? }` |

Response flags: `mfa_enabled` or `totp_enabled` (boolean).

All require **Bearer token** + pharmacist can only change own `pharmacist_id`.

---

### 6. Help

Static content in the UI — no API required unless you add a CMS/help URL field later.

---

## Login response (should include enough to render settings before GET)

`POST /pharmacist/login/` should return (or embed under `pharmacy`):

```json
{
  "token": "jwt…",
  "pharmacist": {
    "pharmacist_id": "…",
    "email": "…",
    "first_name": "…",
    "last_name": "…"
  },
  "pharmacy": {
    "pharmacy_id": "…",
    "name": "…",
    "display_name": "…",
    "address": "…",
    "phone": "…",
    "email": "…",
    "website": "…",
    "description": "…",
    "license_number": "…",
    "tax_number": "…",
    "whatsapp": "…",
    "verification_status": "verified"
  }
}
```

Frontend stores this in `localStorage.pharmacist` today; **`GET /pharmacist/settings/`** should be the source of truth after login.

---

## Errors

| Status | When |
|--------|------|
| 400 | Validation |
| 401 | Missing/invalid token |
| 403 | Wrong `pharmacist_id` or pharmacy suspended |
| 404 | Unknown pharmacist |

JSON: `{ "error": "human message", "detail": "…", "fields": { } }` (DRF-style is fine).

---

## What the frontend will do after backend is ready

1. Add `getPharmacistSettings(pharmacistId)` / `patchPharmacistSettings(pharmacistId, patch)` in `api.js`.
2. On opening **Settings**, `GET` and bind forms (replace `localStorage`-only profile save).
3. Each **Save** button → `PATCH` with the relevant subsection.
4. Top-bar **Accepting requests** → `PATCH { operations: { accepting_requests } }`.
5. **Update password** → `POST /pharmacist/password/change/`.
6. Keep existing MFA calls; show API errors in the Security panel.

---

## Patient settings (separate page — mostly wired)

Route: `/patient/settings` (`PatientSettings.jsx`).

| Feature | Method | Path | Query |
|---------|--------|------|--------|
| Load/save preferences | `GET` / `PATCH` | `/patient/profile/` | `session_id` and/or `conversation_id` |
| MFA | `GET` / `POST` | `/patient/mfa/status/`, `…/setup/start/`, `…/confirm/`, `…/disable/` | same query |

### `PATCH /patient/profile/` body (already sent by UI)

```json
{
  "preferred_language": "en",
  "max_search_radius_km": 10,
  "home_area": "Avondale, Harare",
  "email_notifications": true,
  "drug_interaction_alerts": true
}
```

### `GET /patient/profile/` response

```json
{
  "profile": {
    "preferred_language": "en",
    "max_search_radius_km": 10,
    "home_area": "Avondale, Harare",
    "email_notifications": true,
    "drug_interaction_alerts": true
  }
}
```

Guest patients without `session_id` / `conversation_id` cannot save — UI shows: *Register or use the chatbot to save settings.*

Patient MFA: same shape as pharmacist (`otpauth_uri`, `mfa_enabled` on status).

---

## Priority order for backend

1. **`GET/PATCH /pharmacist/settings/`** (or pharmacy profile PATCH) — Profile section  
2. **`accepting_requests`** in operations — syncs with live request queue  
3. **`POST /pharmacist/password/change/`**  
4. **Operations / notifications / service** sub-objects (can ship incrementally)  
5. **MFA routes** (if not already deployed)  
6. **Patient profile + MFA** (if patient settings still fail in your environment)

When (1) is live, tell the frontend team and we will replace local-only saves with API calls.
