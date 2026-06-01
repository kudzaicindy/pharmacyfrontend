# Patient pickup & reservation — backend contract

The frontend persists a **pickup snapshot** in `localStorage` (`last_pickup_snapshot`) and refreshes it from the API when the user returns via **Continue your search**, **My pickup**, or the chatbot resume flow.

## What the frontend sends

### `POST /api/chatbot/reserve/`

```json
{
  "pharmacy_id": "<uuid or id>",
  "quantity": 1,
  "medicine_name": "paracetamol",
  "conversation_id": "<uuid>",
  "session_id": "<uuid>",
  "request_id": "<medicine_request_id>",
  "medicine_request_id": "<same as request_id>"
}
```

- `medicine_name` may be omitted if the backend resolves it from `conversation_id` (already supported).
- **`request_id` / `medicine_request_id`** are now sent when the patient has an active search so the reservation is tied to the correct medicine request (please persist and enforce one active reservation per request where appropriate).

Optional (logged-in patients): `patient_phone` if you use it today.

### `GET /api/chatbot/patient/requests/{requestId}/?session_id=…&conversation_id=…`

Used on resume to load pharmacy list **and** reservation state.

### `GET /api/chatbot/request/{requestId}/ranked/?conversation_id=…`

Used while polling; frontend merges any reservation hints from this payload into the snapshot.

---

## What the frontend needs back

### 1. `POST /reserve/` response (201)

Return enough to show “Reserved at X” and block double-booking without another round-trip:

```json
{
  "message": "Reserved at HealthFirst Pharmacy. Pick up within 2 hours.",
  "reservation_id": "res-uuid",
  "status": "pending",
  "pharmacy_id": "pharm-uuid",
  "pharmacy_name": "HealthFirst Pharmacy",
  "medicine_name": "paracetamol",
  "quantity": 1,
  "request_id": "req-uuid",
  "expires_at": "2026-05-24T14:00:00Z",
  "confirmed_at": null
}
```

Alternatively nest under `reservation: { … }` with the same fields.

**Status values** (lowercase string):

| status | Patient UI label |
|--------|------------------|
| `pending` | Awaiting pharmacy confirmation |
| `confirmed` | Confirmed — ready for pickup |
| `completed` / `picked_up` | Picked up (no longer blocks reserve) |
| `cancelled` / `expired` | Terminal — allow reserve again |

When the pharmacist calls `POST …/reservations/{id}/confirm/`, update status to **`confirmed`** and set **`confirmed_at`**.

### 2. `GET /patient/requests/{id}/` — include reservations

```json
{
  "request_id": "…",
  "short_request_id": "MC-1234",
  "status": "responses_received",
  "medicine_names": ["paracetamol"],
  "location_address": "Avondale, Harare",
  "reservations": [
    {
      "reservation_id": "…",
      "pharmacy_id": "…",
      "pharmacy_name": "HealthFirst Pharmacy",
      "medicine_name": "paracetamol",
      "quantity": 1,
      "status": "confirmed",
      "confirmed_at": "2026-05-24T12:30:00Z",
      "created_at": "2026-05-24T12:00:00Z",
      "expires_at": "2026-05-24T14:00:00Z"
    }
  ],
  "pharmacy_responses": [ … ]
}
```

Frontend also accepts: `active_reservations`, `active_reservation`, or a single `reservation` object.

### 3. Ranked list — per-pharmacy flags (optional but helpful)

On each `pharmacy_responses[]` row:

```json
{
  "pharmacy_id": "…",
  "pharmacy_name": "…",
  "holiday_mode": true,
  "holiday_notes": "We are currently unavailable",
  "phone": "+263…",
  "has_reservation": true,
  "reservation_id": "…",
  "reservation_status": "pending"
}
```

When `holiday_mode` is true or `holiday_notes` indicates unavailability, the patient UI hides **Reserve** and shows **Call pharmacy**. **`POST /reserve/`** must return **403** with `"code": "pharmacy_unavailable"` so reserves cannot slip through if flags were missing on the ranked list.

Or embed `patient_reservation: { reservation_id, status, … }`.

Top-level `reservations: []` on the ranked payload is also merged.

### 4. Pharmacist alternatives — cannot reserve online

When the patient tries to reserve a medicine that is **only a pharmacist-suggested alternative** (not in live inventory under that exact name), return **400** with a clear code and contact details:

```json
{
  "error": "You cannot reserve online for this medicine — it is an alternative suggested by the pharmacist. Please call the pharmacy.",
  "code": "pharmacist_alternative",
  "medicine_name": "omeprazole",
  "pharmacy_name": "HealthFirst Pharmacy",
  "pharmacy_phone": "+263771234567",
  "pharmacy_whatsapp": "+263771234567",
  "pharmacy_email": "info@healthfirst.example"
}
```

Alternatively nest contact under `pharmacy_contact: { phone, whatsapp, email }`.

The frontend maps legacy errors like `Medicine "omeprazole" not found at this pharmacy` to the same UX.

Include **`phone` / `whatsapp` / `email`** on each `pharmacy_responses[]` row in ranked/patient GET payloads when possible so “Call to reserve” works before the POST fails.

### 5. Business rules (recommended)

1. **One active reservation per `request_id`** (pending or confirmed, not expired). Second `POST /reserve/` for another pharmacy → `409` with `{ "error": "…", "existing_reservation_id": "…" }`.
2. **Reject duplicate reserve** for the same `pharmacy_id` + `request_id` → `409`.
3. After pharmacist **confirm**, expose `status: "confirmed"` on patient poll/detail endpoints so the banner updates without reload.
4. Include **`pharmacy_name`** on reservation objects (patients do not know internal IDs).

---

## Local snapshot shape (for your reference)

Written to `localStorage` key `last_pickup_snapshot`:

```json
{
  "request_id": "…",
  "conversation_id": "…",
  "pharmacy_name": "HealthFirst Pharmacy",
  "pharmacy_id": "…",
  "medicines": ["paracetamol"],
  "reservations": [
    {
      "reservation_id": "…",
      "pharmacy_id": "…",
      "pharmacy_name": "…",
      "medicine_name": "paracetamol",
      "status": "pending",
      "confirmed_at": null
    }
  ],
  "updated_at": "…"
}
```

---

## Pharmacist side (already used)

- `POST /pharmacist/reservations/{id}/confirm/` — should flip patient-visible status to `confirmed`.
- `POST /pharmacist/reservations/{id}/complete/` — should flip to `completed` / `picked_up`.

Ensure patient-facing GET endpoints reflect those updates within the same poll cycle the chatbot uses.
