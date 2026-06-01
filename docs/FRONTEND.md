# MediConnect — Frontend Documentation

This document describes the **pharmacyfrontend** repository: a React single-page application (SPA) for **MediConnect** — patient, pharmacy, and admin experiences backed by a separate REST API.

---

## 1. Tech stack

| Layer | Technology | Version (approx.) |
|-------|------------|-------------------|
| Runtime | React | 19.x |
| Routing | react-router-dom | 7.x |
| Build | Vite | 7.x |
| Language | JavaScript (JSX) | ES modules |
| HTTP | `fetch` | Native |
| Icons | lucide-react | 0.56x |
| PDF (admin reports) | jspdf | 4.x |
| Markdown (reports) | marked | 18.x |
| PWA | vite-plugin-pwa | 1.x |

---

## 2. Scripts

```bash
npm install          # dependencies
npm run dev          # Vite dev server (hot reload)
npm run build        # production bundle → dist/
npm run preview      # serve production build locally
npm run lint         # ESLint
```

---

## 3. Environment variables

Configure via `.env` (Vite prefix: `VITE_`).

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Base URL for the chatbot/pharmacy API (e.g. `https://…/api/chatbot` or `http://localhost:8000/api/chatbot`). If unset, the app uses built-in defaults (see `src/utils/api.js`). |
| `VITE_ADMIN_LOGIN_PATH` | Optional override for admin login path (e.g. if Django mounts admin auth elsewhere). |
| `VITE_PHARMACIST_REQUESTS_INCLUDE_HISTORY` | When `true`, pharmacist requests fetch may include history (backend-dependent). |

---

## 4. Project structure

```
src/
├── main.jsx                 # React root
├── App.jsx                  # Router + route table
├── App.css, index.css       # Global styles
├── components/
│   ├── AdminAppShell.jsx    # Admin layout chrome
│   ├── PatientLayout.jsx    # Patient area layout + nested routes
│   ├── Chatbot.jsx          # AI assistant (medicine search, location, etc.)
│   └── admin/               # Admin-specific sections (MediBot, command center, tab views)
├── context/
│   └── LanguageContext.jsx
├── pages/
│   ├── LandingPage.jsx
│   ├── Login.jsx
│   ├── ForgotPassword.jsx
│   ├── Register.jsx
│   ├── Patient*.jsx         # Dashboard, search, requests, history, saved, assistant, notifications, profile, settings
│   ├── PharmacyDashboard.jsx
│   ├── AdminDashboard.jsx
│   ├── Admin*.jsx           # Control center, requests, pharmacies, pharmacists, patient control, request detail
│   └── *.css                # Page-level styles
└── utils/
    ├── api.js               # All API endpoints + helpers (largest module)
    └── *.js                 # Domain helpers (nav, leaderboard, audit, etc.)
```

---

## 5. Routes (`App.jsx`)

| Path | Page / layout |
|------|----------------|
| `/` | Landing |
| `/login`, `/admin/login` | Login (patient / pharmacy / admin + optional MFA step) |
| `/forgot-password` | Password reset via email code |
| `/register` | Registration |
| `/patient/*` | `PatientLayout` + nested routes (`dashboard`, `search`, `requests`, `history`, `saved`, `ai-assistant`, `notifications`, `profile`, `settings`) |
| `/pharmacy/dashboard` | Pharmacy portal |
| `/admin/dashboard` | Main admin dashboard |
| `/admin/control-center`, `/admin/pharmacies`, `/admin/pharmacists`, `/admin/requests`, `/admin/requests/:id`, `/admin/patients/:sessionId` | Admin sub-pages |
| `*` | Redirect to `/` |

---

## 6. Roles and client-side session

| Role | Storage (typical keys) | Notes |
|------|------------------------|--------|
| Patient | `patient`, `chatbot_session_id`, `chatbot_conversation_id`, `userRole`, `token` | Many patient APIs require `session_id` or `conversation_id` query params. |
| Pharmacist | `pharmacist`, `pharmacist_id`, `pharmacy_id`, `userRole`, `token` | Pharmacy dashboard reads pharmacist + pharmacy from `localStorage`. |
| Admin | `admin`, `userRole`, `token`; CSRF in `sessionStorage` | Admin writes use Django-style CSRF (`X-CSRFToken`, cookies) when same-origin; see `api.js`. |

---

## 7. API layer (`src/utils/api.js`)

- **Single base URL** — `API_BASE_URL` (from `VITE_API_URL` or defaults).
- **Endpoints** — chat, registration, login (patient/pharmacist/admin), inventory, reservations, rankings, patient dashboard, **admin** dashboards, MediBot overview, reports, MFA/password-reset paths, etc.
- **Helpers** — `getPatientSessionIds()`, paginated admin list normalizers, CSRF helpers for admin POST/PATCH/DELETE.

**Important:** Email, SMS, PDF generation on the server, and business rules live on the **backend**. The frontend sends flags and JSON bodies documented in JSDoc where relevant (e.g. `notify_patient_request_email`, `notify_patient_by_email`, password reset, MFA).

---

## 8. Major features by area

### 8.1 Public & auth

- Landing, login (3 roles), optional **MFA** second step (`completeMfaLogin`).
- **Forgot password**: request code → confirm with new password.
- Register: patient; pharmacy + pharmacist flows as implemented.

### 8.2 Patient

- Dashboard, search, requests, history, saved medicines, notifications, profile.
- **PatientAssistant** / embedded **Chatbot**: medicine search, location, prescription upload (`POST /upload-prescription/`), low-confidence **Confirm** → `prescription_broadcast` on `POST /chat/`. If **OCR fails**, the image is still uploaded and broadcast via `prescription_image_only` + `ocr_failed` on `POST /chat/` (after location when required); pharmacists respond from the Rx image. Header **language** selector (EN / Shona / Ndebele) sends `language: en|sn|nd` on every chat/upload.
- **Drug interactions (embedded rules, not DrugBank):** Backend sends `drug_interactions` on `POST /chat/`, `POST /upload-prescription/`, `POST /check-interactions/`, ranked (`envelope=true` → `meta.drug_interactions`, or `include_drug_interactions=true`), and WebSockets (`medicine_request_snapshot`, `medicine_request_ranked_update`). Frontend: `src/utils/drugInteractions.js`, ranked fetch via `fetchRankedForPatientRequest` (envelope + DDI params), MediBot panel above ranked results; respects patient `drug_interaction_alerts` in localStorage.
- **FR28 i18n (EN / SN / ND)**: Central catalog in `src/utils/i18n/` (`stringsChatbot.js`, `stringsPatient.js`, `stringsPharmacy.js`, `stringsCommon.js`, `index.js`). `LanguageContext` exposes `t(key)` and persists `healthconnect_language`. Translated: MediBot (prompts, errors, ranking copy), patient portal nav/dashboard/settings toggles, landing hero/nav, login labels, pharmacy portal nav/tabs/cards/common errors (language selector in pharmacy sidebar). `chatbotI18n.js` re-exports from `i18n/index.js` for backward compatibility. Patient profile `preferred_language` syncs UI when changed in settings.
- Pharmacist requests expose **`prescription_review`**, **`has_prescription_image`**, **`prescription_image_url`**; UI: `PrescriptionReviewPanel` in respond modal and request “More info”.
- **Settings**: notifications + location/language; **2FA** setup when `/patient/mfa/…` exists on server.

### 8.3 Pharmacy (`PharmacyDashboard.jsx`)

- Requests (incl. prescription image + OCR snapshot), responses, inventory (bulk update), reservations, ranking summary, analytics-style views, earnings, settings.
- **Inventory CSV export** (client-generated download).
- **Profile** fields in settings: persisted to `localStorage` under `pharmacist` until a dedicated profile API exists.
- **Security**: pharmacist **2FA** UI → `/pharmacist/mfa/…` when backend supports it.

### 8.4 Admin (`AdminDashboard.jsx` + related pages)

- Aggregated dashboard data, MediBot overview + widgets merge, verification queue, lists (users, patients, chatbot logs), CSV exports.
- **PDF reports**: AI narrative + Markdown (`marked`) + themed `jsPDF` output; fallback sections if narrative missing.
- **Performance**: lighter initial `getAdminDashboardData` limits, background full hydrate, optional fetch timeouts, deferred chatbot log fetch on overview.

### 8.5 Chatbot (`Chatbot.jsx`)

- Session generation, conversation flow, polling for ranked responses when enabled.
- Optional **`notify_patient_request_email: true`** when logged-in patient has an email in `localStorage` (backend must honor).

---

## 9. Styling & design tokens

- Global tokens in `src/index.css` (`:root`): fonts, teal palette, borders, etc.
- Page-specific CSS: `Auth.css`, `PatientLayout.css`, `PharmacyDashboard.css`, `AdminDashboard.css`, `LandingPage.css`, `Chatbot.css`, etc.

---

## 10. Build output

- `npm run build` → static assets in **`dist/`**.
- Deploy **`dist/`** to any static host (Netlify, Vercel, S3+CloudFront, Nginx). Set **`VITE_API_URL`** at build time for the correct API origin.

---

## 11. Known limitations (for docs / thesis)

- **No server in this repo** — CORS, cookies, and CSRF behaviour depend on API deployment.
- **Tokens in `localStorage`** — convenient for SPA; production hardening may prefer HttpOnly cookies (backend change).
- **Lint / test coverage** — run `npm run lint`; add Vitest/Playwright when you need automated regression tests.

---

## 12. Related files

| Topic | Location |
|-------|----------|
| API endpoints & helpers | `src/utils/api.js` |
| Routes | `src/App.jsx` |
| Admin PDF / Markdown export | `src/pages/AdminDashboard.jsx` (export flow) |
| Backend contract notes (if any) | `docs/ADMIN_DASHBOARD_BACKEND_SPEC.md` |

---

*Last updated to reflect the repository layout and stack. Adjust version numbers after `npm update`.*
