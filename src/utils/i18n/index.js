/**
 * App-wide i18n (FR28) — EN / Shona (SN) / Ndebele (ND).
 */

import { mergeStringTables, createTranslator, chatLangApiCode, normalizeUiLang, profileLangToUi } from './core'
import { CHATBOT_STRINGS, CHAT_ACTION } from './stringsChatbot'
import { PATIENT_STRINGS } from './stringsPatient'
import { PHARMACY_STRINGS } from './stringsPharmacy'
import { COMMON_STRINGS } from './stringsCommon'

export { CHAT_ACTION, chatLangApiCode, normalizeUiLang, profileLangToUi }

const ALL_STRINGS = mergeStringTables(
  CHATBOT_STRINGS,
  PATIENT_STRINGS,
  PHARMACY_STRINGS,
  COMMON_STRINGS
)

export const t = createTranslator(ALL_STRINGS)

/** Alias used by MediBot. */
export const tChat = t

const WAITING_FOR_PHARMACIES_RE =
  /waiting for pharmacies|request has been sent|responses will appear|kumirira machemist|silinde amapharmacy/i

const CARRY_PRESCRIPTION_ALREADY_RE =
  /carry your (original )?paper prescription|bring your (original )?prescription|takura chirevo|uwathathe isiqinisekiso/i

export function isWaitingForPharmaciesMessage(text) {
  return Boolean(text && WAITING_FOR_PHARMACIES_RE.test(String(text)))
}

export function enrichWaitingForPharmaciesMessage(text, uiLang, { prescription = false } = {}) {
  const base = String(text || '').trim()
  if (!prescription) return base
  if (base && CARRY_PRESCRIPTION_ALREADY_RE.test(base)) return base
  const reminder = t(uiLang, 'waiting.carryPrescription')
  return base ? `${base}\n\n${reminder}` : reminder
}

export function waitingForPharmaciesBotText(uiLang, { prescription = false } = {}) {
  return enrichWaitingForPharmaciesMessage(t(uiLang, 'waiting.sent'), uiLang, { prescription })
}

export function labelChatAction(uiLang, actionId) {
  const map = {
    [CHAT_ACTION.USE_MY_LOCATION]: 'action.useMyLocation',
    [CHAT_ACTION.ENTER_MANUALLY]: 'action.enterManually',
    [CHAT_ACTION.YES_SEARCH_MEDICINES]: 'action.yesSearch',
    [CHAT_ACTION.NO_DESCRIBE_DIFFERENTLY]: 'action.noDifferent',
    [CHAT_ACTION.CONFIRM_PRESCRIPTION]: 'action.confirm',
    [CHAT_ACTION.EDIT_MANUALLY]: 'action.editManually',
    [CHAT_ACTION.SEND_RX_TO_PHARMACIES]: 'action.sendRxToPharmacies',
  }
  return t(uiLang, map[actionId] || actionId)
}

export function normalizeChatActionId(action) {
  if (!action) return action
  if (Object.values(CHAT_ACTION).includes(action)) return action
  const legacy = {
    'Use My Location': CHAT_ACTION.USE_MY_LOCATION,
    'Enter Manually': CHAT_ACTION.ENTER_MANUALLY,
    'Yes, search for these medicines': CHAT_ACTION.YES_SEARCH_MEDICINES,
    'No, let me describe differently': CHAT_ACTION.NO_DESCRIBE_DIFFERENTLY,
    Confirm: CHAT_ACTION.CONFIRM_PRESCRIPTION,
    'Edit Manually': CHAT_ACTION.EDIT_MANUALLY,
    'Send image to pharmacies': CHAT_ACTION.SEND_RX_TO_PHARMACIES,
  }
  return legacy[action] || action
}

export function pharmacyWord(uiLang, count) {
  return count === 1 ? t(uiLang, 'pharmacy.one') : t(uiLang, 'pharmacy.many')
}

export function formatReservationStatusForPatient(status, uiLang = 'EN') {
  const s = String(status || '').toLowerCase().trim()
  if (!s || s === 'pending' || s === 'awaiting_confirmation' || s === 'reserved' || s === 'active') {
    return t(uiLang, 'res.awaiting')
  }
  if (s === 'confirmed' || s.includes('confirm')) return t(uiLang, 'res.confirmed')
  if (['completed', 'picked_up', 'collected', 'fulfilled'].includes(s)) return t(uiLang, 'res.pickedUp')
  if (s === 'cancelled' || s === 'canceled') return t(uiLang, 'res.cancelled')
  if (s === 'expired') return t(uiLang, 'res.expired')
  return s.replace(/_/g, ' ')
}

export function getPharmacyGreeting(uiLang) {
  const h = new Date().getHours()
  if (h < 12) return t(uiLang, 'ph.greeting.morning')
  if (h < 17) return t(uiLang, 'ph.greeting.afternoon')
  return t(uiLang, 'ph.greeting.evening')
}

export function getPharmacyTabHeadline(uiLang, activeTab) {
  const map = {
    requests: 'ph.tab.requests',
    inventory: 'ph.tab.inventory',
    reservations: 'ph.tab.fulfillment',
    analytics: 'ph.tab.ranking',
    earnings: 'ph.tab.earnings',
    settings: 'ph.tab.settings',
  }
  return t(uiLang, map[activeTab] || 'ph.tab.dashboard')
}
