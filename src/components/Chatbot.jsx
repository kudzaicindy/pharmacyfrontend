import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageSquarePlus, Send, X, Bot, User, MapPin, Upload, Clock, Pill, CheckCircle, Star } from 'lucide-react'
import { sendChatMessage, uploadPrescription, fetchRankedForPatientRequest, ratePharmacy, checkDrugInteractions, reserveMedicine, generateSessionId } from '../utils/api'
import {
  prescriptionConfidencePercent,
  prescriptionReviewFromUploadResult,
  buildPrescriptionBroadcastChatOptions,
  buildPrescriptionImageOnlyBroadcastOptions,
  prescriptionNeedsPharmacistReviewPath,
  prescriptionOcrExtractionUnavailable,
  prescriptionRequestAlreadyBroadcast,
  prescriptionUploadUserMessage,
} from '../utils/prescriptionReview'
import { clearRankedFetchGate } from '../utils/rankedFetchGate'
import {
  extractDrugInteractionsFromPayload,
  patientDrugInteractionAlertsEnabled,
  hasDrugInteractionWarnings,
  normalizeDrugInteractionsPayload,
} from '../utils/drugInteractions'
import { openDirections } from '../utils/directions'
import {
  persistResumeContext,
  clearResumeContext,
  savePickupSnapshot,
  buildPickupSnapshot,
  getResumeContext,
  getPickupSnapshot,
  getReservedPharmacyIdSet,
  findPharmacyReservation,
  formatReservationStatusForPatient,
  extractReservationsFromPayload,
  mergeReservationsIntoSnapshot,
  recordReservationInSnapshot,
  refreshPickupReservationsFromBackend,
  getPrimaryActiveReservation,
} from '../utils/patientPickupStorage'
import {
  buildLocationForChat,
  formatLocationLabel,
  hasUsableLocation,
  mergeLocationFromResponse,
  tryGetBrowserCoords,
} from '../utils/chatLocation'
import {
  alternativeReserveFeedback,
  buildReserveErrorFeedback,
  hasAnyContact,
  medicineRowIsPharmacistAlternative,
  telHref,
  unavailableReserveFeedback,
  whatsappHref,
} from '../utils/reservePatientUi'
import {
  pharmacyRowBlocksPatientReserve,
  pharmacyUnavailablePatientMessage,
} from '../utils/pharmacySettingsStorage'
import {
  medRowKey,
  mergeMedicineRows,
  getCombinedPharmacyMedicines,
  medicineRowInStock,
  medicineNamesMatchRequest,
  pharmacyProvidesUsefulResponse,
} from '../utils/chatPharmacyResults'
import { useLanguage } from '../context/LanguageContext'
import {
  CHAT_ACTION,
  chatLangApiCode,
  tChat,
  labelChatAction,
  normalizeChatActionId,
  pharmacyWord,
  enrichWaitingForPharmaciesMessage,
  isWaitingForPharmaciesMessage,
  waitingForPharmaciesBotText,
} from '../utils/chatbotI18n'
import './Chatbot.css'

function ReservationFeedback({ message }) {
  if (!message) return null
  const html = String(message.text || '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  const isSuccess = message.type === 'success'
  return (
    <div
      className={`reservation-feedback ${isSuccess ? 'reservation-success' : 'reservation-error'}`}
      role="status"
    >
      <p dangerouslySetInnerHTML={{ __html: html }} />
      {!isSuccess && message.contact && (
        <div className="reservation-contact">
          <p className="reservation-contact-title">
            Contact {message.pharmacyName || 'the pharmacy'} to reserve:
          </p>
          <div className="reservation-contact-links">
            {message.contact.phone && (
              <a href={telHref(message.contact.phone)}>{message.contact.phone}</a>
            )}
            {message.contact.whatsapp && (
              <a href={whatsappHref(message.contact.whatsapp) || '#'} target="_blank" rel="noopener noreferrer">
                WhatsApp {message.contact.whatsapp}
              </a>
            )}
            {message.contact.email && (
              <a href={`mailto:${message.contact.email}`}>{message.contact.email}</a>
            )}
          </div>
        </div>
      )}
      {!isSuccess &&
        (message.variant === 'pharmacist_alternative' || message.variant === 'pharmacy_unavailable') &&
        !hasAnyContact(message.contact) && (
        <p className="reservation-contact-missing">
          Phone or email for this pharmacy was not included in the response — use Get directions to visit, or ask
          the pharmacy for their number when you call.
        </p>
      )}
    </div>
  )
}

/** Ask backend to email request summary when logged-in patient has an email on file. */
function withPatientRequestEmailNotify(options = {}) {
  try {
    const raw = localStorage.getItem('patient')
    if (!raw) return options
    const p = JSON.parse(raw)
    const em = String(p?.email || '').trim()
    if (em.includes('@')) return { ...options, notifyPatientRequestEmail: true }
  } catch {
    /* ignore */
  }
  return options
}

/** Backend disclaimer on chat / check-interactions responses — show verbatim when present. */
function apiDisclaimerFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return ''
  const raw = payload.disclaimer ?? payload.disclaimer_text ?? payload.patient_disclaimer
  if (typeof raw !== 'string') return ''
  const t = raw.trim()
  return t
}

function Chatbot({ isOpen, onClose, initialQuery = '', initialMode = null, initialMedicines = null, resumeSession = false }) {
  const { language, setLanguage, languages } = useLanguage()
  const apiLanguage = chatLangApiCode(language)

  const [messages, setMessages] = useState(() => {
    const lang = localStorage.getItem('healthconnect_language') || 'EN'
    return [
      {
        id: 1,
        text: tChat(lang, 'greeting.initial'),
        sender: 'bot',
        timestamp: new Date(),
        type: 'text',
      },
    ]
  })
  const [input, setInput] = useState(initialQuery)
  const [isTyping, setIsTyping] = useState(false)
  const [conversationState, setConversationState] = useState('initial')
  const [userLocation, setUserLocation] = useState(null)
  const [sessionId, setSessionId] = useState(() => {
    const stored = localStorage.getItem('chatbot_session_id')
    return stored || generateSessionId()
  })
  const [conversationId, setConversationId] = useState(
    () => localStorage.getItem('chatbot_conversation_id') || null
  )
  const [medicineRequestId, setMedicineRequestId] = useState(
    () => localStorage.getItem('last_medicine_request_id') || null
  )
  const [pollConfig, setPollConfig] = useState(null) // { poll_url, poll_interval_seconds } from backend
  const [resultsShown, setResultsShown] = useState(false)
  const [pharmacyResultsDisplay, setPharmacyResultsDisplay] = useState(null) // { responses, rankingPending, recommendation }
  const [responseCount, setResponseCount] = useState(0)
  const [pendingVerification, setPendingVerification] = useState(null)
  const [ratedPharmacies, setRatedPharmacies] = useState({}) // { pharmacy_id: rating }
  const [drugInteractions, setDrugInteractions] = useState(null) // { interactions, disclaimer, source }

  const applyDrugInteractionsFromApi = useCallback((payload, fallbackMedicines = []) => {
    if (!patientDrugInteractionAlertsEnabled()) {
      setDrugInteractions(null)
      return
    }
    const hasDdiField =
      payload &&
      (Object.prototype.hasOwnProperty.call(payload, 'drug_interactions') ||
        payload.meta?.drug_interactions != null)
    if (hasDdiField) {
      const ddi = extractDrugInteractionsFromPayload(payload)
      setDrugInteractions(hasDrugInteractionWarnings(ddi) ? ddi : null)
      return
    }
    const meds = (Array.isArray(fallbackMedicines) ? fallbackMedicines : [])
      .map((m) => String(m || '').trim())
      .filter(Boolean)
    if (meds.length >= 2) {
      checkDrugInteractions(meds)
        .then((data) => {
          const ddi =
            extractDrugInteractionsFromPayload(data) || normalizeDrugInteractionsPayload(data)
          setDrugInteractions(hasDrugInteractionWarnings(ddi) ? ddi : null)
        })
        .catch(() => {})
    }
  }, [])

  const applyDrugInteractionsFromApiRef = useRef(applyDrugInteractionsFromApi)
  useEffect(() => {
    applyDrugInteractionsFromApiRef.current = applyDrugInteractionsFromApi
  }, [applyDrugInteractionsFromApi])
  const [reservationMessage, setReservationMessage] = useState(null) // { type: 'success'|'error', text }
  const [reservedPharmacies, setReservedPharmacies] = useState(
    () => getReservedPharmacyIdSet(getPickupSnapshot())
  )
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const lastRequestIdRef = useRef(medicineRequestId)
  const searchModeRef = useRef(initialMode)  // symptom | direct | prescription - for backend flow
  const currentRequestIdRef = useRef(medicineRequestId)   // for result isolation - ignore poll results for old requests
  const lastResumedRequestRef = useRef(null)
  const nextMessageIdRef = useRef(2) // initial greeting uses id 1; every new message gets a unique id
  const pollTimerRef = useRef(null)
  const pollGenerationRef = useRef(0)
  const isOpenRef = useRef(isOpen)
  const medicineRequestIdRef = useRef(medicineRequestId)
  const conversationIdRef = useRef(conversationId)
  const pollConfigRef = useRef(pollConfig)
  const pharmacyResultsDisplayRef = useRef(pharmacyResultsDisplay)

  const MIN_POLL_INTERVAL_MS = 5000
  const MAX_POLL_INTERVAL_MS = 15000
  /** Full medicine list for POST /api/chatbot/chat/ (interaction check / prescription); longer lists win over shorter. */
  const chatMedicinesContextRef = useRef(null)
  /** When OCR fails, broadcast after patient shares location. */
  const pendingRxImageBroadcastRef = useRef(null)
  const lastPrescriptionFileRef = useRef(null)

  const genMessageId = () => nextMessageIdRef.current++

  const applyReservationsToUi = (snap) => {
    setReservedPharmacies(getReservedPharmacyIdSet(snap))
  }

  const syncReservationsFromApiPayload = (data) => {
    const incoming = extractReservationsFromPayload(data)
    if (incoming.length === 0) return
    const merged = mergeReservationsIntoSnapshot(getPickupSnapshot() || {}, incoming)
    savePickupSnapshot(merged)
    applyReservationsToUi(merged)
  }

  const normalizeMedicineStrings = (arr) =>
    Array.isArray(arr) ? [...new Set(arr.map((m) => String(m || '').trim()).filter(Boolean))] : []

  const mergeChatMedicinesRef = (incoming) => {
    const norm = normalizeMedicineStrings(incoming)
    if (norm.length === 0) return
    const cur = chatMedicinesContextRef.current
    if (!Array.isArray(cur) || cur.length === 0) {
      chatMedicinesContextRef.current = norm
      return
    }
    if (norm.length >= cur.length) {
      chatMedicinesContextRef.current = norm
    }
  }

  const buildChatPayloadOptions = (extra = {}) => {
    const base = withPatientRequestEmailNotify({ ...extra, language: apiLanguage })
    const meds = chatMedicinesContextRef.current
    if (Array.isArray(meds) && meds.length > 0) {
      base.medicines = meds
    }
    return base
  }

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length !== 1 || prev[0]?.sender !== 'bot' || prev[0]?.type !== 'text') return prev
      if (prev[0]?.verifyData || prev[0]?.actions?.length) return prev
      return [{ ...prev[0], text: tChat(language, 'greeting.initial') }]
    })
  }, [language])

  useEffect(() => {
    if (!isOpen) return
    applyReservationsToUi(getPickupSnapshot())
  }, [isOpen])

  useEffect(() => {
    if (sessionId) {
      localStorage.setItem('chatbot_session_id', sessionId)
    }
  }, [sessionId])

  useEffect(() => {
    if (conversationId) {
      localStorage.setItem('chatbot_conversation_id', conversationId)
    }
  }, [conversationId])

  useEffect(() => {
    isOpenRef.current = isOpen
  }, [isOpen])

  useEffect(() => {
    medicineRequestIdRef.current = medicineRequestId
  }, [medicineRequestId])

  useEffect(() => {
    conversationIdRef.current = conversationId
  }, [conversationId])

  useEffect(() => {
    pollConfigRef.current = pollConfig
  }, [pollConfig])

  useEffect(() => {
    pharmacyResultsDisplayRef.current = pharmacyResultsDisplay
  }, [pharmacyResultsDisplay])

  useEffect(() => {
    if (medicineRequestId || conversationId) {
      persistResumeContext({
        requestId: medicineRequestId,
        conversationId,
      })
    }
  }, [medicineRequestId, conversationId])

  useEffect(() => {
    if (initialMode) searchModeRef.current = initialMode
  }, [initialMode])

  useEffect(() => {
    if (Array.isArray(initialMedicines) && initialMedicines.length > 0) {
      mergeChatMedicinesRef(initialMedicines)
    }
  }, [initialMedicines])

  useEffect(() => {
    if (initialQuery && initialMode === 'direct') {
      handleSend(initialQuery)
    } else if (initialMode === 'symptom') {
      setInput(tChat(language, 'chip.input.symptomPrefix'))
    }
  }, [initialQuery, initialMode])

  useEffect(() => {
    scrollToBottom()
  }, [messages, pharmacyResultsDisplay])

  // Lock body scroll when chatbot is open (keeps mobile view stable)
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
    }
  }, [isOpen])

  const stopPollingTimer = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  const getPollIntervalMs = () => {
    const sec = Number(pollConfigRef.current?.poll_interval_seconds ?? 10)
    const ms = (Number.isFinite(sec) ? sec : 10) * 1000
    return Math.min(MAX_POLL_INTERVAL_MS, Math.max(MIN_POLL_INTERVAL_MS, ms))
  }

  // Track request id for polling / result isolation. Do not clear pharmacyResultsDisplay on first
  // id assignment — location + live-inventory responses set display in the same turn; clearing caused a race that hid results.
  useEffect(() => {
    if (!medicineRequestId || medicineRequestId === lastRequestIdRef.current) return
    const prevRequestId = lastRequestIdRef.current
    lastRequestIdRef.current = medicineRequestId
    currentRequestIdRef.current = medicineRequestId
    setResultsShown(false)
    if (prevRequestId != null && prevRequestId !== medicineRequestId) {
      setPharmacyResultsDisplay(null)
    }
    stopPollingTimer()
    pollGenerationRef.current += 1
  }, [medicineRequestId])

  // One sequential poll loop per request (no setInterval — next tick only after previous fetch + wait)
  useEffect(() => {
    stopPollingTimer()
    pollGenerationRef.current += 1
    const generation = pollGenerationRef.current
    let cancelled = false

    const wait = (ms) =>
      new Promise((resolve) => {
        pollTimerRef.current = setTimeout(resolve, ms)
      })

    const runPollLoop = async () => {
      await wait(600)
      while (!cancelled && pollGenerationRef.current === generation) {
        if (!isOpenRef.current) break
        const reqId = medicineRequestIdRef.current
        const convId = conversationIdRef.current
        if (!reqId || !convId) break

        const latest = pharmacyResultsDisplayRef.current
        if (latest && !latest.rankingPending) break

        await fetchPharmacyResponses()
        if (cancelled || pollGenerationRef.current !== generation) break

        const after = pharmacyResultsDisplayRef.current
        if (after && !after.rankingPending) break

        await wait(getPollIntervalMs())
      }
    }

    if (isOpen && medicineRequestId && conversationId) {
      const display = pharmacyResultsDisplayRef.current
      if (!display || display.rankingPending) {
        runPollLoop()
      }
    }

    return () => {
      cancelled = true
      stopPollingTimer()
      if (pollGenerationRef.current === generation) {
        pollGenerationRef.current += 1
      }
    }
  }, [medicineRequestId, conversationId, isOpen])

  // WebSocket: wake up polling immediately when a pharmacist responds
  useEffect(() => {
    if (!medicineRequestId) return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    // IMPORTANT: use backend host/port, not frontend dev server
    const backendHost = '127.0.0.1:8000' // Django server in dev; change for production backend host
    const wsUrl = `${protocol}://${backendHost}/ws/chatbot/${medicineRequestId}/`

    let socket
    try {
      socket = new WebSocket(wsUrl)
    } catch (err) {
      console.error('[WebSocket] failed to connect', err)
      return undefined
    }

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log('[WebSocket] message', data)
        if (data.medicine_request_id && data.medicine_request_id !== medicineRequestId) return
        applyDrugInteractionsFromApiRef.current?.(data)
        if (
          data.event === 'medicine_request_ranked_update' ||
          data.event === 'medicine_request_snapshot'
        ) {
          fetchPharmacyResponses({ force: true })
        }
      } catch (err) {
        console.error('[WebSocket] parse error', err)
      }
    }

    socket.onerror = (err) => {
      console.error('[WebSocket] error', err)
    }

    return () => {
      try {
        socket.close()
      } catch (err) {
        // ignore
      }
    }
  }, [medicineRequestId])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const getLocation = async () => {
    setIsTyping(true)
    const coords = await tryGetBrowserCoords({ timeoutMs: 12000 })
    setIsTyping(false)
    if (!coords) {
      askForManualLocation()
      return
    }
    const location = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      address: null,
      suburb: null,
    }
    setUserLocation(location)
    await handleLocationReceived(location)
  }

  const askForManualLocation = () => {
    const botMessage = {
      id: genMessageId(),
      text: tChat(language, 'location.manual'),
      sender: 'bot',
      timestamp: new Date(),
      type: 'text'
    }
    setMessages(prev => [...prev, botMessage])
    setConversationState('waiting_for_location')
  }

  const handleLocationReceived = async (location) => {
    setConversationState('searching_pharmacies')
    await sendLocationToBackend(location)
  }

  const sendLocationToBackend = async (location) => {
    try {
      setIsTyping(true)
      const response = await sendChatMessage(
        tChat(language, 'payload.useMyLocation'),
        sessionId,
        conversationId,
        location,
        buildChatPayloadOptions({ input_type: 'location' })
      )

      const merged = mergeLocationFromResponse(response, location)
      if (hasUsableLocation(merged)) {
        setUserLocation(merged)
      }

      const label = formatLocationLabel(merged)
      const hasLiveResults =
        response.from_live_inventory && Array.isArray(response.pharmacy_responses) && response.pharmacy_responses.length > 0
      const botMessage = {
        id: genMessageId(),
        text:
          (hasLiveResults && response.response) ||
          (Array.isArray(response.pharmacy_responses) && response.pharmacy_responses.length > 0 && response.response) ||
          tChat(language, 'location.saved', { label }),
        sender: 'bot',
        timestamp: new Date(),
        type: 'text',
        disclaimer: apiDisclaimerFromPayload(response),
      }
      setMessages((prev) => [...prev, botMessage])

      if (Array.isArray(response.medicines) && response.medicines.length > 0) {
        mergeChatMedicinesRef(response.medicines)
      } else if (Array.isArray(response.medicine_names) && response.medicine_names.length > 0) {
        mergeChatMedicinesRef(response.medicine_names)
      }
      applyDrugInteractionsFromApi(
        response,
        response.medicines || response.medicine_names || chatMedicinesContextRef.current
      )

      if (response.conversation_id) {
        setConversationId(response.conversation_id)
        conversationIdRef.current = response.conversation_id
      }
      if (response.medicine_request_id) {
        medicineRequestIdRef.current = response.medicine_request_id
        currentRequestIdRef.current = response.medicine_request_id
        setMedicineRequestId(response.medicine_request_id)
      }
      setPollConfig(
        response.polling_enabled &&
          response.poll_url &&
          (response.total_responses === 0 || !response.pharmacy_responses?.length)
          ? { poll_url: response.poll_url, poll_interval_seconds: response.poll_interval_seconds ?? 10 }
          : null
      )

      applyPharmacyResponsesFromChat(response)

      if (pendingRxImageBroadcastRef.current || lastPrescriptionFileRef.current) {
        const rxResult = await finalizePrescriptionRequestAtLocation(merged)
        if (rxResult) {
          const rxText = enrichWaitingForPharmaciesMessage(
            (typeof rxResult.response === 'string' && rxResult.response.trim()) ||
              waitingForPharmaciesBotText(language, { prescription: true }),
            language,
            { prescription: true }
          )
          setMessages((prev) => [
            ...prev,
            {
              id: genMessageId(),
              text: rxText,
              sender: 'bot',
              timestamp: new Date(),
              type: 'text',
              disclaimer: apiDisclaimerFromPayload(rxResult),
            },
          ])
        }
      } else if (response.is_new_pharmacy_responses === true && Array.isArray(response.pharmacy_responses)) {
        const newList =
          Array.isArray(response.new_pharmacy_responses) && response.new_pharmacy_responses.length
            ? response.new_pharmacy_responses
            : response.pharmacy_responses
        setMessages((prev) => [
          ...prev,
          {
            id: genMessageId(),
            text:
              response.response ||
              tChat(language, 'msg.newResponsesFrom', {
                count: newList.length,
                word: pharmacyWord(language, newList.length),
              }),
            sender: 'bot',
            timestamp: new Date(),
            type: 'new_pharmacy_responses',
            pharmacy_responses: newList,
          },
        ])
      }

      setIsTyping(false)
      // Don't manually call fetchPharmacyResponses - let polling handle it
    } catch (error) {
      setIsTyping(false)
      const errorMessage = {
        id: genMessageId(),
        text: tChat(language, 'error.generic'),
        sender: 'bot',
        timestamp: new Date(),
        type: 'text'
      }
      setMessages(prev => [...prev, errorMessage])
    }
  }

  const persistPickupFromDisplay = (display, requestId = medicineRequestId, convId = conversationId) => {
    if (!display?.responses?.length) return
    const snap = buildPickupSnapshot({
      requestId,
      conversationId: convId,
      medicines: display.requested_medicines,
      responses: display.responses,
      recommendation: display.recommendation,
    })
    if (snap) savePickupSnapshot(snap)
  }

  const openDirectionsForPharmacy = (pharmacyName, suburbOrAddress, pharmacy = null) => {
    const row =
      pharmacy ||
      (pharmacyResultsDisplay?.responses || []).find((p) => p.pharmacy_name === pharmacyName)
    if (row) {
      persistPickupFromDisplay(pharmacyResultsDisplay)
      const snap = buildPickupSnapshot({
        requestId: medicineRequestId,
        conversationId,
        medicines: pharmacyResultsDisplay?.requested_medicines,
        responses: pharmacyResultsDisplay?.responses,
        recommendation: pharmacyResultsDisplay?.recommendation,
        pharmacy: row,
      })
      if (snap) savePickupSnapshot(snap)
    }
    openDirections(pharmacyName, suburbOrAddress)
  }

  const handleNewChat = async () => {
    stopPollingTimer()
    pollGenerationRef.current += 1
    clearRankedFetchGate(medicineRequestIdRef.current, conversationIdRef.current)
    clearResumeContext()
    try {
      localStorage.removeItem('chatbot_conversation_id')
      localStorage.removeItem('last_medicine_request_id')
    } catch {
      /* ignore */
    }
    lastResumedRequestRef.current = null
    setMedicineRequestId(null)
    medicineRequestIdRef.current = null
    currentRequestIdRef.current = null
    lastRequestIdRef.current = null
    setConversationId(null)
    conversationIdRef.current = null
    setPharmacyResultsDisplay(null)
    setPollConfig(null)
    pollConfigRef.current = null
    setConversationState('initial')
    setResultsShown(false)
    setResponseCount(0)
    setPendingVerification(null)
    setRatedPharmacies({})
    setDrugInteractions(null)
    setReservationMessage(null)
    setReservedPharmacies(new Set())
    applyReservationsToUi(null)
    chatMedicinesContextRef.current = null
    pendingRxImageBroadcastRef.current = null
    lastPrescriptionFileRef.current = null
    searchModeRef.current = null
    setInput('')
    setUserLocation(null)
    nextMessageIdRef.current = 2
    const newSessionId = generateSessionId()
    setSessionId(newSessionId)
    try {
      localStorage.setItem('chatbot_session_id', newSessionId)
    } catch {
      /* ignore */
    }
    setMessages([
      {
        id: 1,
        text: tChat(language, 'greeting.newChat'),
        sender: 'bot',
        timestamp: new Date(),
        type: 'text',
      },
    ])
    try {
      await sendChatMessage(
        tChat(language, 'payload.startNewSearch'),
        newSessionId,
        null,
        null,
        buildChatPayloadOptions({ start_new_search: true })
      )
    } catch (err) {
      console.error('New chat init:', err)
    }
  }

  const sortMedsForDisplay = (medList, requestedOrder) => {
    if (!Array.isArray(medList) || medList.length === 0) return medList
    if (!Array.isArray(requestedOrder) || requestedOrder.length === 0) return medList
    const orderMap = new Map(requestedOrder.map((m, i) => [String(m).toLowerCase(), i]))
    const req = []
    const extra = []
    for (const m of medList) {
      const k = medRowKey(m)
      if (orderMap.has(k)) req.push(m)
      else extra.push(m)
    }
    req.sort((a, b) => (orderMap.get(medRowKey(a)) ?? 999) - (orderMap.get(medRowKey(b)) ?? 999))
    extra.sort((a, b) => medRowKey(a).localeCompare(medRowKey(b)))
    return [...req, ...extra]
  }

  const requestedMedicineKeys = (resolvedMedicines) =>
    new Set((resolvedMedicines || []).map((m) => medRowKey({ medicine: m })).filter(Boolean))

  const pharmacyHasAnyInStockOffer = (pharmacy, resolvedMedicines) =>
    getCombinedPharmacyMedicines(pharmacy, resolvedMedicines).some((m) => medicineRowInStock(m))

  const pharmacyHasRequestedInStock = (pharmacy, resolvedMedicines) => {
    const requested = Array.isArray(resolvedMedicines) ? resolvedMedicines.filter(Boolean) : []
    if (requested.length === 0) return pharmacyHasAnyInStockOffer(pharmacy, resolvedMedicines)
    return getCombinedPharmacyMedicines(pharmacy, resolvedMedicines).some(
      (m) =>
        medicineRowInStock(m) &&
        requested.some((requestedName) =>
          medicineNamesMatchRequest(m?.medicine || m?.medicine_name, requestedName)
        )
    )
  }

  const pharmacyOffersOnlyAlternatives = (pharmacy, resolvedMedicines) =>
    pharmacyHasAnyInStockOffer(pharmacy, resolvedMedicines) &&
    !pharmacyHasRequestedInStock(pharmacy, resolvedMedicines)

  const fetchPharmacyResponses = async (opts = {}) => {
    const requestIdAtStart = medicineRequestIdRef.current
    const convId = conversationIdRef.current
    const cfg = pollConfigRef.current
    if (!requestIdAtStart || !convId) return

    const displayBefore = pharmacyResultsDisplayRef.current
    if (!opts.force && displayBefore && !displayBefore.rankingPending) return

    try {
      let responses = []
      let resultsForRequestId = null
      let recommendation = null
      const data = await fetchRankedForPatientRequest(requestIdAtStart, convId, {
        pollUrl: cfg?.poll_url || null,
        limit: 10,
        force: opts.force === true,
      })
      if (data == null) return

      syncReservationsFromApiPayload(data)

      const rankedMeds =
        data?.medicine_names ||
        data?.suggested_medicines ||
        getMedicineNamesFromResponses(
          Array.isArray(data)
            ? data
            : data?.pharmacy_responses || data?.responses || data?.results || data?.items || []
        )
      applyDrugInteractionsFromApi(data, rankedMeds)

      resultsForRequestId = data?.results_for_request_id || data?.medicine_request_id
      recommendation = data?.recommendation || null
      responses = Array.isArray(data)
        ? data
        : (data?.pharmacy_responses ||
            data?.responses ||
            data?.results ||
            data?.items ||
            [])

      // Merge any new_pharmacy_responses into the main list so pharmacist replies show up
      const newReplies = Array.isArray(data?.new_pharmacy_responses)
        ? data.new_pharmacy_responses
        : []

      if (newReplies.length > 0) {
        const byId = new Map()

        // Seed with existing responses (live inventory / previous ranking)
        responses.forEach((p) => {
          const key = p.pharmacy_id || p.pharmacy_name
          byId.set(key, { ...p })
        })

        // Merge pharmacist replies in by pharmacy_id / name
        newReplies.forEach((reply) => {
          const key = reply.pharmacy_id || reply.pharmacy_name
          const existing = byId.get(key) || {}

          byId.set(key, {
            ...existing,
            ...reply,
            medicines_breakdown: mergeMedicineRows(
              existing.medicines_breakdown,
              reply.medicines_breakdown
            ),
            medicine_responses: mergeMedicineRows(
              existing.medicine_responses,
              reply.medicine_responses
            ),
            medicines: mergeMedicineRows(existing.medicines, reply.medicines)
          })
        })

        responses = Array.from(byId.values())
      }

      // Result isolation: only display when results are for this request and user hasn't started a new search
      if (currentRequestIdRef.current !== requestIdAtStart) return
      if (resultsForRequestId && resultsForRequestId !== requestIdAtStart) return

      const count = responses.length
      setResponseCount(count)

      if (count > 0) {
        const rankingPending = responses.some(p => p.ranking_pending === true)
        const requestedMeds = data?.medicine_names || data?.suggested_medicines || getMedicineNamesFromResponses(responses)

        // Always refresh the main ranked card with the full list
        const prevDisplay = pharmacyResultsDisplayRef.current
        updatePharmacyResultsDisplay(
          responses,
          recommendation,
          rankingPending,
          !!data?.from_live_inventory || !!prevDisplay?.from_live_inventory,
          prevDisplay?.live_inventory_medicine ||
            data?.live_inventory_medicine ||
            requestedMeds?.[0] ||
            null,
          requestedMeds,
          { liveResultsNote: data?.live_results_note || prevDisplay?.live_results_note }
        )

        // If backend says these include new arrivals, show a small "New response(s)" bubble
        if (data?.is_new_pharmacy_responses === true) {
          const newList = Array.isArray(data.new_pharmacy_responses) && data.new_pharmacy_responses.length
            ? data.new_pharmacy_responses
            : responses

          setMessages(prev => [...prev, {
            id: genMessageId(),
            text:
              data.response ||
              tChat(language, 'msg.newResponsesFrom', {
                count: newList.length,
                word: pharmacyWord(language, newList.length),
              }),
            sender: 'bot',
            timestamp: new Date(),
            type: 'new_pharmacy_responses',
            pharmacy_responses: newList
          }])
        }

        if (!rankingPending || data?.polling_enabled === false) {
          stopPollingTimer()
          if (!rankingPending) setResultsShown(true)
        }
      }
    } catch (error) {
      console.error('Error fetching pharmacy responses:', error)
    }
  }

  /** Derive medicine names from pharmacy responses when API sends medicines_breakdown (or medicine_responses) but not suggested_medicines */
  const getMedicineNamesFromResponses = (responses) => {
    if (!Array.isArray(responses) || responses.length === 0) return []
    const names = new Set()
    responses.forEach((p) => {
      const breakdown = getCombinedPharmacyMedicines(p)
      breakdown.forEach((item) => {
        const name = item.medicine || item.medicine_name
        if (name) names.add(typeof name === 'string' ? name : String(name))
      })
    })
    return Array.from(names)
  }

  const fmtKm = (v) => {
    const n = Number(v)
    return v != null && v !== '' && !Number.isNaN(n) ? n.toFixed(1) : 'N/A'
  }
  const fmtScore = (v) => {
    const n = Number(v)
    return v != null && v !== '' && !Number.isNaN(n) ? n.toFixed(1) : null
  }
  const fmtMedPrice = (price) => {
    if (price == null || price === '' || price === 'N/A') return 'N/A'
    const n = Number(price)
    return !Number.isNaN(n) ? `$${n.toFixed(2)}` : String(price)
  }

  const applyPharmacyResponsesFromChat = (response) => {
    const rp = response?.pharmacy_responses
    if (!Array.isArray(rp) || rp.length === 0) return false

    const reqId = response.medicine_request_id || response.results_for_request_id
    if (response.results_for_request_id && reqId && response.results_for_request_id !== reqId) {
      return false
    }

    const rankingPending = rp.some((p) => p.ranking_pending === true)
    const fromLive = !!response.from_live_inventory
    const medName =
      response.live_inventory_medicine ||
      (rp[0]?.medicines_breakdown?.[0]?.medicine) ||
      (rp[0]?.medicine_responses?.[0]?.medicine) ||
      (rp[0]?.medicine_name) ||
      null
    const requestedMeds =
      response.medicine_names ||
      response.suggested_medicines ||
      getMedicineNamesFromResponses(rp)

    updatePharmacyResultsDisplay(
      rp,
      response.recommendation || null,
      rankingPending,
      fromLive,
      medName,
      requestedMeds,
      {
        liveResultsNote: response.live_results_note,
        apiResponseText: response.response,
      }
    )
    applyDrugInteractionsFromApi(response, requestedMeds)
    return true
  }

  const updatePharmacyResultsDisplay = (
    responses,
    recommendation = null,
    rankingPending = false,
    fromLiveInventory = false,
    liveInventoryMedicine = null,
    requestedMedicines = null,
    options = {}
  ) => {
    const liveResultsNote = options.liveResultsNote || ''
    const usefulOpts = { fromLiveInventory, requestedMedicines: requestedMedicines || [] }
    const isUseful = (p) => pharmacyProvidesUsefulResponse(p, usefulOpts)

    const availablePharmacies = responses.filter(isUseful)
    const unavailablePharmacies = responses.filter((p) => !isUseful(p))
    const count = availablePharmacies.length
    const pWord = pharmacyWord(language, count)
    const naLabel = tChat(language, 'na')

    // Use provided list or derive from medicines_breakdown / medicine_responses
    const resolvedMedicines = (Array.isArray(requestedMedicines) && requestedMedicines.length > 0)
      ? requestedMedicines
      : getMedicineNamesFromResponses(responses)

    let resultText = ''
    if (options.apiResponseText && String(options.apiResponseText).trim()) {
      resultText += `${String(options.apiResponseText).trim()}\n\n`
    }
    const medicineLabel = resolvedMedicines.length > 0 ? resolvedMedicines.join(', ') : null
    if (medicineLabel && !options.apiResponseText) {
      resultText += tChat(language, 'results.searchingFor', { meds: medicineLabel })
    }
    if (fromLiveInventory && !options.apiResponseText) {
      resultText += tChat(language, 'results.liveBanner')
      if (liveResultsNote) {
        resultText += `${liveResultsNote}\n\n`
      }
    }
    const totalResponses = responses.length
    if (!options.apiResponseText) {
      if (rankingPending) {
        if (count > 0) {
          resultText += tChat(language, 'results.rankingPending', { count, word: pWord })
        }
      } else if (count > 0) {
        resultText += fromLiveInventory
          ? tChat(language, 'results.foundLive', { count, word: pWord })
          : tChat(language, 'results.foundCount', { count, word: pWord })
      }
    }

    // Show recommendation if available (only when final)
    if (!rankingPending && recommendation && recommendation.recommended_pharmacy) {
      const reason =
        recommendation.reason ||
        tChat(language, 'results.recommendationDefault', {
          pharmacy: recommendation.recommended_pharmacy,
        })
      resultText += tChat(language, 'results.recommendation', { reason })
    }

    const isRanked = responses.some((p) => p.rank !== undefined && p.rank !== null)

    const rankedPharmacies = isRanked
      ? [...responses]
          .filter((p) => isUseful(p) || (fromLiveInventory && p.rank != null))
          .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
      : []

    if (isRanked && rankedPharmacies.length > 0) {
      const sortedPharmacies = rankedPharmacies
      const reqKeys = requestedMedicineKeys(resolvedMedicines)

      sortedPharmacies.forEach((pharmacy) => {
        const rankIcon = pharmacy.rank === 1 ? '🥇' : pharmacy.rank === 2 ? '🥈' : pharmacy.rank === 3 ? '🥉' : '📍'
        resultText += `${rankIcon} **#${pharmacy.rank || naLabel} - ${pharmacy.pharmacy_name}**\n`
        resultText += `   📍 ${tChat(language, 'results.distance')}: ${fmtKm(pharmacy.distance_km)} km\n`
        resultText += `   ⏱️ ${tChat(language, 'results.travelTime')}: ${pharmacy.estimated_travel_time ?? naLabel} min\n`
        resultText += `   ⏳ ${tChat(language, 'results.prepTime')}: ${pharmacy.preparation_time || 0} min\n`
        const totalMin = pharmacy.total_time_minutes
        const totalMinText = totalMin != null && !Number.isNaN(Number(totalMin)) ? `${Number(totalMin)}` : naLabel
        resultText += `   🕐 ${tChat(language, 'results.totalTime')}: ${totalMinText} min\n`
        const scoreStr = fmtScore(pharmacy.ranking_score)
        if (scoreStr != null) {
          resultText += `   ⭐ ${tChat(language, 'results.score')}: ${scoreStr}\n`
        }
        if (pharmacyOffersOnlyAlternatives(pharmacy, resolvedMedicines)) {
          resultText += tChat(language, 'results.onlyAlternatives')
        }
        const medList = sortMedsForDisplay(
          getCombinedPharmacyMedicines(pharmacy, resolvedMedicines),
          resolvedMedicines
        )
        if (medList.length > 0) {
          resultText += `   💊 **${tChat(language, 'results.medicines')}:**\n`
          medList.forEach((medResp) => {
            const name = medResp.medicine || medResp.medicine_name || '—'
            const inStock = medicineRowInStock(medResp)
            const statusIcon = inStock ? '✅' : '❌'
            resultText += `      ${statusIcon} ${name}: `
            if (inStock) {
              resultText += fmtMedPrice(medResp.price)
              if (medResp.quantity != null) {
                resultText += ` (${tChat(language, 'results.qty')} ${medResp.quantity})`
              }
            } else {
              resultText += tChat(language, 'results.notAvailable')
            }
            if (medResp.alternative) {
              resultText += ` | ${tChat(language, 'results.alternative')}: ${medResp.alternative}`
            }
            if (inStock && reqKeys.size > 0) {
              const requestedList = Array.isArray(resolvedMedicines) ? resolvedMedicines : []
              const fromPharm = medResp.from_pharmacist_only === true || medResp.from_pharmacist_only === 'true'
              const matchesRequested = requestedList.some((requestedName) =>
                medicineNamesMatchRequest(name, requestedName)
              )
              if (fromPharm || !matchesRequested) {
                resultText += tChat(language, 'results.pharmacistAlternative')
              }
            }
            resultText += `\n`
          })
        } else {
          resultText += `   💰 Price: $${pharmacy.price || 'N/A'}\n`
        }
        
        // Handle alternative medicines with new format (array of objects)
        if (pharmacy.alternative_medicines && pharmacy.alternative_medicines.length > 0) {
          resultText += tChat(language, 'results.alternativesLine', {
            label: tChat(language, 'results.alternative'),
          })
          const altList = pharmacy.alternative_medicines.map((alt) => {
            if (typeof alt === 'string') return alt
            if (alt.medicine && alt.suggested_by) {
              return tChat(language, 'results.suggestedBy', {
                medicine: alt.medicine,
                who: alt.suggested_by,
              })
            }
            if (alt.medicine) return alt.medicine
            return alt
          }).filter(Boolean)
          resultText += `${altList.join(', ')}\n`
        }

        if (pharmacy.notes) {
          resultText += `   📝 ${tChat(language, 'results.notes')}: ${pharmacy.notes}\n`
        }
        resultText += `\n`
      })
    } else if (availablePharmacies.length > 0) {
      const fbWord = pharmacyWord(language, availablePharmacies.length)
      resultText += tChat(language, 'results.availableAt', {
        count: availablePharmacies.length,
        word: fbWord,
      })
      const reqKeysFb = requestedMedicineKeys(resolvedMedicines)
      availablePharmacies.forEach((pharmacy, index) => {
        resultText += `${index + 1}. **${pharmacy.pharmacy_name}**\n`
        resultText += `   📍 ${tChat(language, 'results.distance')}: ${fmtKm(pharmacy.distance_km)} km\n`
        resultText += `   ⏱️ ${tChat(language, 'results.travelTime')}: ${pharmacy.estimated_travel_time ?? naLabel} min\n`
        resultText += tChat(language, 'results.priceLine', { price: fmtMedPrice(pharmacy.price) })
        resultText += `   ⏳ ${tChat(language, 'results.prepTime')}: ${pharmacy.preparation_time || 0} min\n`
        const totalMinFb = pharmacy.total_time_minutes
        const totalFbText =
          totalMinFb != null && !Number.isNaN(Number(totalMinFb)) ? Number(totalMinFb) : naLabel
        resultText += `   🕐 ${tChat(language, 'results.totalTime')}: ${totalFbText} min\n`
        if (pharmacyOffersOnlyAlternatives(pharmacy, resolvedMedicines)) {
          resultText += tChat(language, 'results.onlyAlternatives')
        }
        const fallbackMedList = sortMedsForDisplay(
          getCombinedPharmacyMedicines(pharmacy, resolvedMedicines),
          resolvedMedicines
        )
        if (fallbackMedList.length > 0) {
          resultText += `   💊 **${tChat(language, 'results.medicines')}:**\n`
          fallbackMedList.forEach((medResp) => {
            const name = medResp.medicine || medResp.medicine_name || '—'
            const inStock = medicineRowInStock(medResp)
            const statusIcon = inStock ? '✅' : '❌'
            let line = `      ${statusIcon} ${name}: ${
              inStock
                ? `${fmtMedPrice(medResp.price)}${
                    medResp.quantity != null
                      ? ` (${tChat(language, 'results.qty')} ${medResp.quantity})`
                      : ''
                  }`
                : tChat(language, 'results.notAvailable')
            }`
            if (inStock && reqKeysFb.size > 0) {
              const requestedList = Array.isArray(resolvedMedicines) ? resolvedMedicines : []
              const fromPharm = medResp.from_pharmacist_only === true || medResp.from_pharmacist_only === 'true'
              const matchesRequested = requestedList.some((requestedName) =>
                medicineNamesMatchRequest(name, requestedName)
              )
              if (fromPharm || !matchesRequested) line += tChat(language, 'results.pharmacistAlternative')
            }
            resultText += `${line}\n`
          })
        }
        // Handle alternative medicines
        if (pharmacy.alternative_medicines && pharmacy.alternative_medicines.length > 0) {
          const altList = pharmacy.alternative_medicines.map(alt => {
            if (typeof alt === 'string') return alt
            if (alt.medicine && alt.suggested_by) return `${alt.medicine} (suggested by ${alt.suggested_by})`
            return alt.medicine || alt
          }).filter(Boolean)
          if (altList.length > 0) {
            resultText += `   💡 Alternatives: ${altList.join(', ')}\n`
          }
        }
        
        if (pharmacy.notes) {
          resultText += `   📝 Notes: ${pharmacy.notes}\n`
        }
        resultText += `\n`
      })
    }

    if (unavailablePharmacies.length > 0) {
      resultText += `❌ **Not available at ${unavailablePharmacies.length} pharmacy(ies):**\n\n`
      unavailablePharmacies.forEach((pharmacy, index) => {
        resultText += `${index + 1}. **${pharmacy.pharmacy_name}**\n`
        
        // Handle alternative medicines for unavailable
        if (pharmacy.alternative_medicines && pharmacy.alternative_medicines.length > 0) {
          const altList = pharmacy.alternative_medicines.map(alt => {
            if (typeof alt === 'string') return alt
            if (alt.medicine && alt.suggested_by) return `${alt.medicine} (suggested by ${alt.suggested_by})`
            return alt.medicine || alt
          }).filter(Boolean)
          if (altList.length > 0) {
            resultText += `   💡 Alternatives: ${altList.join(', ')}\n`
          }
        }
        
        if (pharmacy.notes) {
          resultText += `   📝 Notes: ${pharmacy.notes}\n`
        }
        resultText += `\n`
      })
    }

    // Collect all alternatives with pharmacy info
    const allAlternatives = new Map()
    responses.forEach(pharmacy => {
      if (pharmacy.alternative_medicines && pharmacy.alternative_medicines.length > 0) {
        pharmacy.alternative_medicines.forEach(alt => {
          const altName = typeof alt === 'string' ? alt : (alt.medicine || alt)
          const suggestedBy = typeof alt === 'object' ? (alt.suggested_by || pharmacy.pharmacy_name) : pharmacy.pharmacy_name
          if (altName && !allAlternatives.has(altName)) {
            allAlternatives.set(altName, suggestedBy)
          }
        })
      }
    })
    
    if (allAlternatives.size > 0) {
      resultText += `\n💡 **Alternative medicines suggested by pharmacies:**\n`
      Array.from(allAlternatives.entries()).slice(0, 5).forEach(([alt, pharmacy], index) => {
        resultText += `${index + 1}. ${alt} (suggested by ${pharmacy})\n`
      })
    }

    const nextDisplay = {
      responses,
      recommendation,
      rankingPending,
      resultText,
      from_live_inventory: fromLiveInventory,
      live_inventory_medicine: liveInventoryMedicine,
      live_results_note: liveResultsNote,
      requested_medicines: resolvedMedicines.length > 0 ? resolvedMedicines : [],
    }
    setPharmacyResultsDisplay(nextDisplay)
    setConversationState('showing_results')
    persistPickupFromDisplay(nextDisplay)

    if (!rankingPending) {
      stopPollingTimer()
      setResultsShown(true)
    }
  }

  const promptCallToReserve = (pharmacy, medicineName) => {
    setReservationMessage(
      alternativeReserveFeedback(
        medicineName,
        pharmacy?.pharmacy_name || pharmacy?.name,
        pharmacy
      )
    )
  }

  const handleReserve = async (pharmacyId, pharmacyName, medicineName, quantity = 1, pharmacy = null) => {
    setReservationMessage(null)

    if (pharmacy && pharmacyRowBlocksPatientReserve(pharmacy)) {
      setReservationMessage(unavailableReserveFeedback(pharmacyName, pharmacy))
      return
    }

    try {
      let requested = pharmacyResultsDisplay?.requested_medicines
      if (!Array.isArray(requested) || requested.length === 0) {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i]?.suggested_medicines?.length) {
            requested = messages[i].suggested_medicines
            break
          }
        }
      }
      // Fallback for direct search: scan user messages for medicine-like text (e.g. "paracetamol", "I need paracetamol")
      let fromUserMessage = null
      if (!medicineName && !pharmacyResultsDisplay?.live_inventory_medicine && (!Array.isArray(requested) || requested.length === 0)) {
        const skipTexts = ['use my location', 'enter manually', 'yes', 'no', 'ok', 'okay']
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i]
          if (msg?.sender !== 'user' || typeof msg.text !== 'string') continue
          const t = msg.text.trim()
          if (!t || t.length > 80) continue
          const lower = t.toLowerCase()
          if (skipTexts.some(skip => lower === skip || lower.startsWith(skip + ' '))) continue
          const words = t.split(/\s+/).filter(Boolean)
          if (words.length === 1) {
            fromUserMessage = lower
            break
          }
          if (/need|want|looking|search|find|get|have|need\s/i.test(t)) {
            const after = t.replace(/^(.*?(?:need|want|looking|search|find|get|have)\s+)/i, '').trim()
            const first = (after.split(/[\s,]+/)[0] || '').toLowerCase()
            if (first && first.length < 40) fromUserMessage = first
            break
          }
        }
      }
      // Backend can use first medicine from conversation when conversation_id is sent; otherwise medicine_name is required
      const medicine = medicineName || pharmacyResultsDisplay?.live_inventory_medicine ||
        (Array.isArray(requested) && requested.length > 0 ? requested[0] : null) || fromUserMessage
      if (!conversationId && !medicine) {
        setReservationMessage({ type: 'error', text: tChat(language, 'error.medicineNameMissing') })
        return
      }

      if (pharmacy && medicine) {
        const row = getCombinedPharmacyMedicines(pharmacy, pharmacyResultsDisplay?.requested_medicines).find(
          (m) => medicineNamesMatchRequest(m?.medicine || m?.medicine_name, medicine)
        )
        if (row && medicineRowIsPharmacistAlternative(row, requested)) {
          promptCallToReserve(pharmacy, medicine)
          return
        }
      }

      const result = await reserveMedicine({
        pharmacy_id: pharmacyId,
        ...(medicine && { medicine_name: medicine }),
        quantity,
        conversation_id: conversationId || undefined,
        session_id: sessionId || undefined,
        request_id: medicineRequestId || undefined,
        medicine_request_id: medicineRequestId || undefined,
      })
      const statusLabel = formatReservationStatusForPatient(
        result?.status || result?.reservation?.status || 'pending',
        language
      )
      setReservationMessage({
        type: 'success',
        text:
          result.message ||
          tChat(language, 'msg.reservedAt', { pharmacy: pharmacyName, status: statusLabel }),
      })
      const snap = recordReservationInSnapshot(result, {
        pharmacyId,
        pharmacyName,
        medicineName: medicine,
        quantity,
        requestId: medicineRequestId,
        conversationId,
      })
      applyReservationsToUi(snap)
    } catch (err) {
      const medicine =
        medicineName ||
        pharmacyResultsDisplay?.live_inventory_medicine ||
        pharmacyResultsDisplay?.requested_medicines?.[0]
      setReservationMessage(
        buildReserveErrorFeedback({
          medicineName: medicine,
          pharmacyName,
          pharmacy,
          payload: err.payload,
          rawMessage: err.message,
        })
      )
    }
  }

  // Restore last search only when user chose "Continue your search" (poll loop handles normal opens)
  useEffect(() => {
    if (!isOpen || !resumeSession) return undefined
    const { requestId, conversationId: convId } = getResumeContext()
    if (!requestId || !convId) return undefined
    if (lastResumedRequestRef.current === requestId) return undefined
    lastResumedRequestRef.current = requestId

    let cancelled = false
    const resume = async () => {
      medicineRequestIdRef.current = requestId
      conversationIdRef.current = convId
      currentRequestIdRef.current = requestId
      lastRequestIdRef.current = requestId
      if (medicineRequestId !== requestId) setMedicineRequestId(requestId)
      if (conversationId !== convId) setConversationId(convId)
      try {
        const refreshed = await refreshPickupReservationsFromBackend(requestId)
        if (!cancelled) applyReservationsToUi(refreshed)
        await fetchPharmacyResponses({ force: true })
        if (cancelled) return
        if (pharmacyResultsDisplayRef.current?.responses?.length) {
          setMessages((prev) => [
            ...prev,
            {
              id: genMessageId(),
              text: tChat(language, 'greeting.welcomeBack'),
              sender: 'bot',
              timestamp: new Date(),
              type: 'text',
            },
          ])
        }
      } catch (err) {
        console.error('Could not restore last search:', err)
      }
    }
    resume()
    return () => {
      cancelled = true
    }
  }, [isOpen, resumeSession])

  const handleRatePharmacy = async (pharmacyId, pharmacyName, rating, responseId = null) => {
    try {
      await ratePharmacy(pharmacyId, rating, responseId)
      setRatedPharmacies(prev => ({ ...prev, [pharmacyId]: rating }))
    } catch (err) {
      console.error('Rating failed:', err)
    }
  }

  const handleSend = async (text = input) => {
    if (!text.trim() && conversationState !== 'waiting_for_location') return

    // Handle location input (address + suburb + GPS when available)
    if (conversationState === 'waiting_for_location') {
      const textTrim = text.trim()
      const userMessage = {
        id: genMessageId(),
        text: textTrim,
        sender: 'user',
        timestamp: new Date(),
        type: 'text',
      }
      setMessages((prev) => [...prev, userMessage])
      setConversationState('searching_pharmacies')
      setIsTyping(true)

      try {
        const location = await buildLocationForChat(textTrim, userLocation)
        setUserLocation(location)

        const response = await sendChatMessage(
          textTrim,
          sessionId,
          conversationId,
          location,
          buildChatPayloadOptions({ input_type: 'location' })
        )

        const merged = mergeLocationFromResponse(response, location)
        if (hasUsableLocation(merged)) {
          setUserLocation(merged)
        }

        if (Array.isArray(response.medicines) && response.medicines.length > 0) {
          mergeChatMedicinesRef(response.medicines)
        } else if (Array.isArray(response.medicine_names) && response.medicine_names.length > 0) {
          mergeChatMedicinesRef(response.medicine_names)
        }
        applyDrugInteractionsFromApi(
          response,
          response.medicines || response.medicine_names || chatMedicinesContextRef.current
        )

        if (response.conversation_id) {
          setConversationId(response.conversation_id)
        }
        if (response.medicine_request_id) {
          setMedicineRequestId(response.medicine_request_id)
        }
        setPollConfig(
          response.polling_enabled &&
            response.poll_url &&
            (response.total_responses === 0 || !response.pharmacy_responses?.length)
            ? { poll_url: response.poll_url, poll_interval_seconds: response.poll_interval_seconds ?? 10 }
            : null
        )

        const label = formatLocationLabel(merged)
        const botMessage = {
          id: genMessageId(),
          text:
            response.response ||
            tChat(language, 'location.saved', { label }),
          sender: 'bot',
          timestamp: new Date(),
          type: 'text',
          disclaimer: apiDisclaimerFromPayload(response),
        }
        setMessages((prev) => [...prev, botMessage])

        if (response.medicine_request_id) {
          setMedicineRequestId(response.medicine_request_id)
        }
        setPollConfig(
          response.polling_enabled &&
            response.poll_url &&
            (response.total_responses === 0 || !response.pharmacy_responses?.length)
            ? { poll_url: response.poll_url, poll_interval_seconds: response.poll_interval_seconds ?? 10 }
            : null
        )
        applyPharmacyResponsesFromChat(response)

        if (pendingRxImageBroadcastRef.current || lastPrescriptionFileRef.current) {
          const rxResult = await finalizePrescriptionRequestAtLocation(merged)
          if (rxResult) {
            const rxText = enrichWaitingForPharmaciesMessage(
              (typeof rxResult.response === 'string' && rxResult.response.trim()) ||
                waitingForPharmaciesBotText(language, { prescription: true }),
              language,
              { prescription: true }
            )
            setMessages((prev) => [
              ...prev,
              {
                id: genMessageId(),
                text: rxText,
                sender: 'bot',
                timestamp: new Date(),
                type: 'text',
                disclaimer: apiDisclaimerFromPayload(rxResult),
              },
            ])
          }
        }
      } catch (error) {
        const errorMessage = {
          id: genMessageId(),
          text: tChat(language, 'error.location'),
          sender: 'bot',
          timestamp: new Date(),
          type: 'text'
        }
        setMessages(prev => [...prev, errorMessage])
      } finally {
        setIsTyping(false)
      }
      setInput('')
      return
    }

    const userMessage = {
      id: genMessageId(),
      text: text,
      sender: 'user',
      timestamp: new Date(),
      type: 'text'
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsTyping(true)

    try {
      const options = {}
      if (searchModeRef.current === 'symptom') {
        options.input_type = 'symptom'  // Backend: suggest medicines first, then location
      }

      const response = await sendChatMessage(
        text,
        sessionId,
        conversationId,
        userLocation,
        buildChatPayloadOptions(options)
      )

      const mergedLocation = mergeLocationFromResponse(response, userLocation)
      let effectiveLocation = userLocation
      if (hasUsableLocation(mergedLocation)) {
        setUserLocation(mergedLocation)
        effectiveLocation = mergedLocation
      }

      if (Array.isArray(response.medicines) && response.medicines.length > 0) {
        mergeChatMedicinesRef(response.medicines)
      } else if (Array.isArray(response.medicine_names) && response.medicine_names.length > 0) {
        mergeChatMedicinesRef(response.medicine_names)
      }

      // Update conversation_id if provided
      if (response.conversation_id) {
        setConversationId(response.conversation_id)
        console.log('[Chatbot] Conversation ID set:', response.conversation_id)
      }
      
      // Update medicine_request_id if provided
      if (response.medicine_request_id) {
        setMedicineRequestId(response.medicine_request_id)
        console.log('[Chatbot] Medicine Request ID set:', response.medicine_request_id)
      }

      // Symptom flow: backend may return suggested medicines and ask for confirmation
      const suggestedMedicines = response.suggested_medicines  // e.g. ['Paracetamol', 'Ibuprofen']
      const askConfirmation = response.ask_medicine_confirmation  // true = show Yes/No buttons

      let botReplyText =
        typeof response.response === 'string' ? response.response.trim() : ''
      if (
        searchModeRef.current === 'prescription' &&
        botReplyText &&
        isWaitingForPharmaciesMessage(botReplyText)
      ) {
        botReplyText = enrichWaitingForPharmaciesMessage(botReplyText, language, {
          prescription: true,
        })
      }

      const botMessage = {
        id: genMessageId(),
        text: botReplyText || response.response,
        sender: 'bot',
        timestamp: new Date(),
        type: askConfirmation && suggestedMedicines?.length ? 'medicine_suggestion' : 'text',
        suggested_medicines: suggestedMedicines,
        disclaimer: apiDisclaimerFromPayload(response),
        actions: askConfirmation && suggestedMedicines?.length
          ? [CHAT_ACTION.YES_SEARCH_MEDICINES, CHAT_ACTION.NO_DESCRIBE_DIFFERENTLY]
          : undefined
      }
      setMessages(prev => [...prev, botMessage])

      const ddiMeds =
        response.medicines ||
        response.medicine_names ||
        suggestedMedicines ||
        chatMedicinesContextRef.current ||
        []
      applyDrugInteractionsFromApi(response, ddiMeds)

      if (askConfirmation && suggestedMedicines?.length) {
        setConversationState('awaiting_medicine_confirmation')
        mergeChatMedicinesRef(suggestedMedicines)
      }

      // Debug: Log the response
      console.log('[Chatbot] Response received:', {
        conversation_id: response.conversation_id,
        medicine_request_id: response.medicine_request_id,
        requires_location: response.requires_location,
        has_user_location: hasUsableLocation(effectiveLocation),
        pharmacy_responses_count: response.pharmacy_responses?.length || 0
      })

      // Check if location is required (only when not awaiting medicine confirmation)
      if (!askConfirmation && response.requires_location && !hasUsableLocation(effectiveLocation)) {
        setConversationState('waiting_for_location')
        const locationPrompt = {
          id: genMessageId(),
          text: tChat(language, 'location.prompt'),
          sender: 'bot',
          timestamp: new Date(),
          type: 'location_prompt',
          actions: [CHAT_ACTION.USE_MY_LOCATION, CHAT_ACTION.ENTER_MANUALLY]
        }
        setMessages(prev => [...prev, locationPrompt])
      } else if (!askConfirmation && (response.medicine_request_id || response.pharmacy_responses?.length)) {
        applyPharmacyResponsesFromChat(response)

        const reqId = response.medicine_request_id || response.results_for_request_id
        const matches = !response.results_for_request_id || response.results_for_request_id === reqId
        if (response.pharmacy_responses?.length && matches) {
          setPollConfig(
            response.polling_enabled &&
              response.poll_url &&
              (response.total_responses === 0 || !response.pharmacy_responses?.length)
              ? { poll_url: response.poll_url, poll_interval_seconds: response.poll_interval_seconds ?? 10 }
              : null
          )
        } else if (matches) {
          setPollConfig((response.polling_enabled && response.poll_url && (response.total_responses === 0 || !response.pharmacy_responses?.length))
            ? { poll_url: response.poll_url, poll_interval_seconds: response.poll_interval_seconds ?? 10 }
            : null)
          setConversationState('searching_pharmacies')
          const apiText = typeof response.response === 'string' ? response.response.trim() : ''
          const alreadySaysWaiting = apiText.length > 0 && isWaitingForPharmaciesMessage(apiText)
          if (!alreadySaysWaiting) {
            const searchingMessage = {
              id: genMessageId(),
              text: waitingForPharmaciesBotText(language, {
                prescription: searchModeRef.current === 'prescription',
              }),
              sender: 'bot',
              timestamp: new Date(),
              type: 'text',
              disclaimer: apiDisclaimerFromPayload(response)
            }
            setMessages(prev => [...prev, searchingMessage])
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage = {
        id: genMessageId(),
        text: tChat(language, 'error.generic'),
        sender: 'bot',
        timestamp: new Date(),
        type: 'text'
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsTyping(false)
    }
  }

  const prescriptionUploadNeedsLocation = (location) => !hasUsableLocation(location)

  const setPendingPrescriptionBroadcast = ({ result, review, file, medicines = [], pharmacistPath = false }) => {
    if (!file) return
    pendingRxImageBroadcastRef.current = {
      result: result || {},
      review: review || null,
      file,
      medicines: Array.isArray(medicines) ? medicines : [],
      pharmacistPath: Boolean(pharmacistPath),
    }
  }

  /**
   * Re-upload Rx image with location (multipart) then broadcast via chat.
   * JSON /chat/ cannot attach the image file — upload-prescription must run again with location.
   */
  const finalizePrescriptionRequestAtLocation = async (location) => {
    const pending = pendingRxImageBroadcastRef.current
    const file = pending?.file || lastPrescriptionFileRef.current
    if (!file || !hasUsableLocation(location)) return null

    const pharmacistPath =
      pending?.pharmacistPath ??
      prescriptionNeedsPharmacistReviewPath(pending?.result) ??
      prescriptionOcrExtractionUnavailable(pending?.result)
    const meds = pending?.medicines?.length
      ? pending.medicines
      : Array.isArray(pending?.result?.medicines)
        ? pending.result.medicines.filter(Boolean)
        : []

    let working = { ...(pending?.result || {}) }
    try {
      const uploadRes = await uploadPrescription(
        file,
        sessionId,
        conversationIdRef.current || conversationId,
        location,
        {
          language: apiLanguage,
          pharmacist_review_only: pharmacistPath,
          skip_ocr: pharmacistPath || meds.length === 0,
          broadcast_to_pharmacies: true,
        }
      )
      working = { ...working, ...uploadRes }
      syncPrescriptionUploadIds(uploadRes)
      if (uploadRes.conversation_id) {
        conversationIdRef.current = uploadRes.conversation_id
      }
      applyDrugInteractionsFromApi(working, pending?.medicines?.length ? pending.medicines : working.medicines)
    } catch (uploadErr) {
      console.error('Prescription re-upload with location:', uploadErr)
    }

    const rxReview =
      pending?.review ?? prescriptionReviewFromUploadResult(working)

    if (!prescriptionRequestAlreadyBroadcast(working)) {
      try {
        const broadcastOpts = pharmacistPath || meds.length === 0
          ? buildPrescriptionImageOnlyBroadcastOptions(working, rxReview)
          : buildPrescriptionBroadcastChatOptions(rxReview, meds)
        const broadcastRes = await sendChatMessage(
          tChat(language, 'payload.sendRxToPharmacies'),
          sessionId,
          conversationIdRef.current || conversationId,
          location,
          buildChatPayloadOptions(broadcastOpts)
        )
        working = { ...working, ...broadcastRes }
        syncPrescriptionUploadIds(broadcastRes)
        applyPharmacyResponsesFromChat(broadcastRes)
      } catch (broadcastErr) {
        console.error('Prescription broadcast after location upload:', broadcastErr)
      }
    } else if (Array.isArray(working.pharmacy_responses) && working.pharmacy_responses.length > 0) {
      applyPharmacyResponsesFromChat(working)
    }

    pendingRxImageBroadcastRef.current = null
    setConversationState('searching_pharmacies')
    return working
  }

  const pushPrescriptionLocationPrompt = () => {
    setConversationState('waiting_for_location')
    setMessages((prev) => [
      ...prev,
      {
        id: genMessageId(),
        text: tChat(language, 'location.prompt'),
        sender: 'bot',
        timestamp: new Date(),
        type: 'location_prompt',
        actions: [CHAT_ACTION.USE_MY_LOCATION, CHAT_ACTION.ENTER_MANUALLY],
      },
    ])
  }

  const syncPrescriptionUploadIds = (result) => {
    if (result?.conversation_id) {
      setConversationId(result.conversation_id)
      conversationIdRef.current = result.conversation_id
    }
    if (result?.medicine_request_id) {
      medicineRequestIdRef.current = result.medicine_request_id
      currentRequestIdRef.current = result.medicine_request_id
      setMedicineRequestId(result.medicine_request_id)
    }
    setPollConfig(
      result?.polling_enabled &&
        result?.poll_url &&
        (result?.total_responses === 0 || !result?.pharmacy_responses?.length)
        ? { poll_url: result.poll_url, poll_interval_seconds: result.poll_interval_seconds ?? 10 }
        : null
    )
  }

  const runPharmacistPrescriptionReviewPath = async (result, file, mergedRxLocation) => {
    let working = { ...result }
    const rxMeds = Array.isArray(working.medicines) ? working.medicines.filter(Boolean) : []
    applyDrugInteractionsFromApi(working, rxMeds)
    const rxReview = prescriptionReviewFromUploadResult(working)
    setPendingPrescriptionBroadcast({
      result: working,
      review: rxReview,
      file,
      medicines: [],
      pharmacistPath: true,
    })

    let botText = prescriptionUploadUserMessage(working, tChat, language)
    if (!botText) botText = tChat(language, 'rx.ocrFailedSent')

    const needsLocation = prescriptionUploadNeedsLocation(mergedRxLocation)
    const actions = [CHAT_ACTION.EDIT_MANUALLY]
    if (!needsLocation && !prescriptionRequestAlreadyBroadcast(working)) {
      actions.unshift(CHAT_ACTION.SEND_RX_TO_PHARMACIES)
    }

    if (!prescriptionRequestAlreadyBroadcast(working) && !needsLocation) {
      setMessages((prev) => [
        ...prev,
        {
          id: genMessageId(),
          text: tChat(language, 'rx.stillSendingToPharmacies'),
          sender: 'bot',
          timestamp: new Date(),
          type: 'text',
        },
      ])
      const finalized = await finalizePrescriptionRequestAtLocation(mergedRxLocation)
      if (finalized) {
        working = finalized
        if (typeof finalized.response === 'string' && finalized.response.trim()) {
          botText = finalized.response.trim()
        } else {
          botText = prescriptionUploadUserMessage(finalized, tChat, language) || botText
        }
        actions.length = 0
        actions.push(CHAT_ACTION.EDIT_MANUALLY)
      } else if (!actions.includes(CHAT_ACTION.SEND_RX_TO_PHARMACIES)) {
        actions.unshift(CHAT_ACTION.SEND_RX_TO_PHARMACIES)
      }
    } else if (needsLocation) {
      botText += `\n\n${tChat(language, 'rx.needLocation')}`
    } else if (prescriptionRequestAlreadyBroadcast(working)) {
      pendingRxImageBroadcastRef.current = null
      setConversationState('searching_pharmacies')
    }

    if (!needsLocation) {
      if (isWaitingForPharmaciesMessage(botText)) {
        botText = enrichWaitingForPharmaciesMessage(botText, language, { prescription: true })
      } else if (prescriptionRequestAlreadyBroadcast(working)) {
        botText = enrichWaitingForPharmaciesMessage(botText, language, { prescription: true })
      }
    }

    setMessages((prev) => [
      ...prev,
      {
        id: genMessageId(),
        text: botText,
        sender: 'bot',
        timestamp: new Date(),
        type: 'text',
        actions: actions.length ? actions : undefined,
        disclaimer: apiDisclaimerFromPayload(working),
      },
    ])
    if (needsLocation) {
      pushPrescriptionLocationPrompt()
    }
  }

  const handlePrescriptionUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return
    lastPrescriptionFileRef.current = file

    const userMessage = {
      id: genMessageId(),
      text: tChat(language, 'rx.uploaded', { name: file.name }),
      sender: 'user',
      timestamp: new Date(),
      type: 'prescription'
    }
    setMessages(prev => [...prev, userMessage])
    
    setIsTyping(true)
    setConversationState('processing_prescription')

    try {
      const result = await uploadPrescription(
        file,
        sessionId,
        conversationId,
        userLocation,
        { language: apiLanguage }
      )

      const mergedRxLocation = mergeLocationFromResponse(result, userLocation)
      if (hasUsableLocation(mergedRxLocation)) {
        setUserLocation(mergedRxLocation)
      }

      syncPrescriptionUploadIds(result)

      searchModeRef.current = 'prescription'
      const meds = Array.isArray(result.medicines) ? result.medicines.filter(Boolean) : []
      const confidencePct = prescriptionConfidencePercent(result)
      const pharmacistPath = prescriptionNeedsPharmacistReviewPath(result)
      const needsVerification =
        !pharmacistPath && meds.length > 0 && confidencePct != null && confidencePct < 90

      if (Array.isArray(result.pharmacy_responses) && result.pharmacy_responses.length > 0) {
        applyPharmacyResponsesFromChat(result)
      }

      if (pharmacistPath) {
        await runPharmacistPrescriptionReviewPath(result, file, mergedRxLocation)
        return
      }

      const rxReview = prescriptionReviewFromUploadResult(result)
      const needsRxLocation = prescriptionUploadNeedsLocation(mergedRxLocation)
      if (needsRxLocation) {
        setPendingPrescriptionBroadcast({
          result,
          review: rxReview,
          file,
          medicines: meds,
          pharmacistPath: false,
        })
      }

      if (meds.length > 0) {
        mergeChatMedicinesRef(meds)
      }

      let botText = tChat(language, 'rx.processed')
      if (meds.length > 0) {
        botText += tChat(language, 'rx.medicinesFound')
        botText += `${meds.map((med, idx) => `${idx + 1}. ${med}`).join('\n')}\n\n`
      }
      if (result.dosages) {
        botText += tChat(language, 'rx.dosages')
        botText += `${Object.entries(result.dosages).map(([med, dose]) => `${med}: ${dose}`).join('\n')}\n\n`
      }
      const readingNotes =
        result.prescription_reading_notes ?? result.reading_notes ?? rxReview?.reading_notes
      const displayConfidence = confidencePct ?? 95
      botText += tChat(language, 'rx.confidence', { pct: displayConfidence })
      if (readingNotes) {
        botText += tChat(language, 'rx.notes', { notes: readingNotes })
      }

      if (needsVerification) {
        botText += tChat(language, 'rx.lowConfidence')
        setPendingVerification({
          medicines: meds,
          dosages: result.dosages || {},
          rawResult: result,
          review: rxReview,
        })
      }

      if (meds.length > 0) mergeChatMedicinesRef(meds)
      applyDrugInteractionsFromApi(result, meds)
      if (result.medicine_request_id && !needsVerification && !needsRxLocation) {
        botText += enrichWaitingForPharmaciesMessage(tChat(language, 'rx.searching'), language, {
          prescription: true,
        })
        setConversationState('searching_pharmacies')
      } else if (!needsVerification && needsRxLocation) {
        botText += tChat(language, 'rx.needLocation')
      }

      const botMessage = {
        id: genMessageId(),
        text: botText,
        sender: 'bot',
        timestamp: new Date(),
        type: needsVerification ? 'verify_prescription' : 'text',
        verifyData: needsVerification
          ? { medicines: meds, dosages: result.dosages, rawResult: result, review: rxReview }
          : null,
        actions: needsVerification
          ? [CHAT_ACTION.CONFIRM_PRESCRIPTION, CHAT_ACTION.EDIT_MANUALLY]
          : undefined,
        disclaimer: apiDisclaimerFromPayload(result),
      }
      setMessages((prev) => [...prev, botMessage])

      if (needsVerification) {
        setConversationState('awaiting_verification')
      }
      if (prescriptionUploadNeedsLocation(mergedRxLocation)) {
        pushPrescriptionLocationPrompt()
      }
    } catch (error) {
      console.error('Error uploading prescription:', error)
      const payload = error?.payload
      if (payload && prescriptionNeedsPharmacistReviewPath(payload)) {
        const merged = mergeLocationFromResponse(payload, userLocation)
        if (hasUsableLocation(merged)) setUserLocation(merged)
        await runPharmacistPrescriptionReviewPath(payload, file, merged)
        return
      }
      let errorText = tChat(language, 'error.prescription')
      const raw = String(error?.message || error?.error || '')
      if (/quota|gemini|rate.limit/i.test(raw)) {
        errorText = tChat(language, 'rx.ocrServiceUnavailable')
      } else if (error.message) errorText = error.message
      setMessages((prev) => [
        ...prev,
        {
          id: genMessageId(),
          text: errorText,
          sender: 'bot',
          timestamp: new Date(),
          type: 'text',
          actions: [CHAT_ACTION.SEND_RX_TO_PHARMACIES, CHAT_ACTION.EDIT_MANUALLY],
        },
      ])
    } finally {
      setIsTyping(false)
      if (event.target) event.target.value = ''
    }
  }

  const handleQuickAction = async (action, message) => {
    const actionId = normalizeChatActionId(action)
    if (actionId === CHAT_ACTION.USE_MY_LOCATION) {
      getLocation()
    } else if (actionId === CHAT_ACTION.ENTER_MANUALLY) {
      askForManualLocation()
    } else if (actionId === CHAT_ACTION.YES_SEARCH_MEDICINES && message?.suggested_medicines?.length) {
      const medicines = message.suggested_medicines
      const confirmMessage = tChat(language, 'payload.yesSearch', { meds: medicines.join(', ') })
      setConversationState('initial')
      await handleSend(confirmMessage)
    } else if (actionId === CHAT_ACTION.NO_DESCRIBE_DIFFERENTLY) {
      setConversationState('initial')
      const prompt = {
        id: genMessageId(),
        text: tChat(language, 'symptom.retry'),
        sender: 'bot',
        timestamp: new Date(),
        type: 'text',
      }
      setMessages(prev => [...prev, prompt])
    } else if (
      (actionId === CHAT_ACTION.CONFIRM_PRESCRIPTION || action === 'Confirm') &&
      message?.verifyData
    ) {
      setPendingVerification(null)
      const raw = message.verifyData.rawResult
      const meds = raw?.medicines || message.verifyData.medicines || []
      const review = message.verifyData.review ?? prescriptionReviewFromUploadResult(raw)
      if (meds.length > 0) mergeChatMedicinesRef(meds)
      applyDrugInteractionsFromApi(raw ? { ...raw, medicines: meds } : { medicines: meds }, meds)
      searchModeRef.current = 'prescription'
      if (prescriptionUploadNeedsLocation(userLocation)) {
        pushPrescriptionLocationPrompt()
        return
      }
      setIsTyping(true)
      try {
        const broadcastOpts = buildPrescriptionBroadcastChatOptions(review, meds)
        const response = await sendChatMessage(
          tChat(language, 'payload.confirmRx'),
          sessionId,
          conversationId,
          userLocation,
          buildChatPayloadOptions(broadcastOpts)
        )
        if (response.conversation_id) {
          setConversationId(response.conversation_id)
          conversationIdRef.current = response.conversation_id
        }
        if (response.medicine_request_id) {
          medicineRequestIdRef.current = response.medicine_request_id
          currentRequestIdRef.current = response.medicine_request_id
          setMedicineRequestId(response.medicine_request_id)
        }
        setPollConfig(
          response.polling_enabled &&
            response.poll_url &&
            (response.total_responses === 0 || !response.pharmacy_responses?.length)
            ? { poll_url: response.poll_url, poll_interval_seconds: response.poll_interval_seconds ?? 10 }
            : null
        )
        applyDrugInteractionsFromApi(response, meds)
        applyPharmacyResponsesFromChat(response)
        const confirmBot = {
          id: genMessageId(),
          text: enrichWaitingForPharmaciesMessage(
            response.response || tChat(language, 'rx.confirmed'),
            language,
            { prescription: true }
          ),
          sender: 'bot',
          timestamp: new Date(),
          type: 'text',
          disclaimer: apiDisclaimerFromPayload(response),
        }
        setMessages((prev) => [...prev, confirmBot])
        if (prescriptionUploadNeedsLocation(userLocation)) {
          pushPrescriptionLocationPrompt()
        } else if (response.medicine_request_id || response.pharmacy_responses?.length) {
          setConversationState('searching_pharmacies')
        }
      } catch (err) {
        const errMsg = {
          id: genMessageId(),
          text: err?.message || tChat(language, 'error.confirmRx'),
          sender: 'bot',
          timestamp: new Date(),
          type: 'text',
        }
        setMessages((prev) => [...prev, errMsg])
      } finally {
        setIsTyping(false)
      }
    } else if (actionId === CHAT_ACTION.SEND_RX_TO_PHARMACIES) {
      const file = lastPrescriptionFileRef.current
      const pending = pendingRxImageBroadcastRef.current
      if (!file && !pending?.file) return
      if (!hasUsableLocation(userLocation)) {
        pushPrescriptionLocationPrompt()
        return
      }
      setIsTyping(true)
      try {
        if (pending?.pharmacistPath) {
          await runPharmacistPrescriptionReviewPath(pending.result || {}, file || pending.file, userLocation)
        } else {
          await finalizePrescriptionRequestAtLocation(userLocation)
          setMessages((prev) => [
            ...prev,
            {
              id: genMessageId(),
              text: tChat(language, 'rx.stillSendingToPharmacies'),
              sender: 'bot',
              timestamp: new Date(),
              type: 'text',
            },
          ])
        }
      } finally {
        setIsTyping(false)
      }
    } else if (actionId === CHAT_ACTION.EDIT_MANUALLY || action === 'Edit Manually') {
      setPendingVerification(null)
      const prompt = {
        id: genMessageId(),
        text: tChat(language, 'manual.meds'),
        sender: 'bot',
        timestamp: new Date(),
        type: 'text'
      }
      setMessages(prev => [...prev, prompt])
      setConversationState('waiting_for_manual_medicines')
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!isOpen) return null

  return (
    <div className="chatbot-overlay" onClick={onClose}>
      <div className="chatbot-container" onClick={(e) => e.stopPropagation()}>
        <div className="chatbot-header">
          <div className="chatbot-header-content">
            <div className="chatbot-icon">🤖</div>
            <div>
              <h3>{tChat(language, 'header.title')}</h3>
              <p className="bot-status">{tChat(language, 'header.status')}</p>
            </div>
          </div>
          <div className="chatbot-header-actions">
            <label className="chatbot-lang-wrap">
              <span className="chatbot-lang-label">{tChat(language, 'header.language')}</span>
              <select
                className="chatbot-lang-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label={tChat(language, 'header.language')}
              >
                {Object.entries(languages).map(([code, { name, flag }]) => (
                  <option key={code} value={code}>
                    {flag} {name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="chatbot-new-chat"
              onClick={handleNewChat}
              title={tChat(language, 'header.newChat')}
              aria-label={tChat(language, 'header.newChat')}
            >
              <MessageSquarePlus className="icon" size={18} strokeWidth={2} aria-hidden />
              <span className="chatbot-new-chat-label">{tChat(language, 'header.newChat')}</span>
            </button>
            <button type="button" className="chatbot-close" onClick={onClose}>
              <X className="icon" />
            </button>
          </div>
        </div>

        <div className="chatbot-messages">
          {messages.map((message, msgIndex) => (
            <div key={message.clientKey ?? `msg-${msgIndex}-${message.id}`} className={`message ${message.sender}`}>
              <div className="message-avatar">
                {message.sender === 'bot' ? (
                  <span>🤖</span>
                ) : (
                  <span>👤</span>
                )}
              </div>
              <div className={`message-content ${message.type === 'results' ? 'results-message' : ''} ${message.type === 'new_pharmacy_responses' ? 'new-responses-message' : ''}`}>
                <div className="msg-sender">
                  {message.sender === 'bot' ? tChat(language, 'sender.bot') : tChat(language, 'sender.you')}
                </div>
                {message.type === 'results' ? (
                  <div className="results-content">
                    {message.text.split('\n').map((line, index) => {
                      if (line.includes('**') && line.includes('**')) {
                        const boldText = line.match(/\*\*(.*?)\*\*/g)
                        let formattedLine = line
                        boldText?.forEach(bold => {
                          formattedLine = formattedLine.replace(bold, `<strong>${bold.replace(/\*\*/g, '')}</strong>`)
                        })
                        return <p key={index} dangerouslySetInnerHTML={{ __html: formattedLine }} />
                      }
                      if (line.trim() === '') return <br key={index} />
                      return <p key={index}>{line}</p>
                    })}
                  </div>
                ) : message.type === 'new_pharmacy_responses' ? (
                  <div className="new-pharmacy-responses-card">
                    <div className="new-responses-label">{tChat(language, 'ui.newResponses')}</div>
                    <div className="new-responses-text">
                      {(message.text || '').split('\n').map((line, index) => {
                        if (line.includes('**')) {
                          const boldText = line.match(/\*\*(.*?)\*\*/g)
                          let formattedLine = line
                          boldText?.forEach(bold => {
                            formattedLine = formattedLine.replace(bold, `<strong>${bold.replace(/\*\*/g, '')}</strong>`)
                          })
                          return <p key={index} dangerouslySetInnerHTML={{ __html: formattedLine }} />
                        }
                        if (line.trim() === '') return <br key={index} />
                        return <p key={index}>{line}</p>
                      })}
                    </div>
                    {Array.isArray(message.pharmacy_responses) && message.pharmacy_responses.length > 0 && (
                      <div className="new-responses-list">
                        {message.pharmacy_responses.map((pharmacy, idx) => {
                          const medList = getCombinedPharmacyMedicines(
                            pharmacy,
                            pharmacyResultsDisplay?.requested_medicines
                          )
                          const inStockLine = medList
                            .filter((m) => medicineRowInStock(m))
                            .map((m) => `${m.medicine || m.medicine_name || '—'} ($${m.price || 'N/A'})`)
                            .join(', ')
                          const directionsHint =
                            pharmacy.location_suburb ||
                            pharmacy.location_address ||
                            pharmacy.address ||
                            ''
                          return (
                            <div key={pharmacy.pharmacy_id || pharmacy.pharmacy_name || idx} className="new-response-pharmacy-row">
                              <span className="new-response-pharmacy-name">{pharmacy.pharmacy_name}</span>
                              {pharmacy.distance_km != null && (
                                <span className="new-response-pharmacy-distance"><MapPin size={12} /> {pharmacy.distance_km != null && !Number.isNaN(Number(pharmacy.distance_km)) ? `${Number(pharmacy.distance_km).toFixed(1)} km` : '—'}</span>
                              )}
                              {inStockLine ? (
                                <span className="new-response-medicines">{inStockLine}</span>
                              ) : pharmacy.price != null ? (
                                <span className="new-response-medicines">${pharmacy.price}</span>
                              ) : null}
                              <button
                                type="button"
                                className="btn-directions new-response-directions"
                                onClick={() => openDirectionsForPharmacy(pharmacy.pharmacy_name, directionsHint, pharmacy)}
                              >
                                {tChat(language, 'ui.getDirections')}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <p>{message.text}</p>
                    {message.disclaimer && message.type !== 'medicine_suggestion' ? (
                      <p className="chatbot-api-disclaimer" role="note">
                        {message.disclaimer}
                      </p>
                    ) : null}
                  </>
                )}
                {message.type === 'medicine_suggestion' && message.suggested_medicines?.length > 0 && (
                  <div className="suggested-medicines">
                    {message.suggested_medicines.map((med, idx) => (
                      <span key={idx} className="medicine-chip">{med}</span>
                    ))}
                  </div>
                )}
                {message.type === 'medicine_suggestion' && message.disclaimer ? (
                  <p className="chatbot-api-disclaimer chatbot-api-disclaimer--after-chips" role="note">
                    {message.disclaimer}
                  </p>
                ) : null}
                {message.actions && (
                  <div className="message-actions">
                    {message.actions.map((action, index) => (
                      <button
                        key={index}
                        className="action-button"
                        onClick={() => handleQuickAction(action, message)}
                      >
                        {normalizeChatActionId(action) === CHAT_ACTION.USE_MY_LOCATION && (
                          <MapPin className="action-icon" />
                        )}
                        {labelChatAction(language, normalizeChatActionId(action))}
                      </button>
                    ))}
                  </div>
                )}
                <span className="message-time">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}

          {/* Live-updating pharmacy results (from polling) */}
          {drugInteractions?.interactions?.length > 0 && (
            <div className="message bot">
              <div className="message-avatar">
                <Bot className="avatar-icon" />
              </div>
              <div className="message-content drug-interactions-message">
                <p className="drug-interactions-title">⚠️ {tChat(language, 'ui.drugInteractions')}</p>
                <div className="drug-interactions-list">
                  {drugInteractions.interactions.map((int, idx) => (
                    <div key={idx} className={`drug-interaction-item severity-${(int.severity || 'mild').toLowerCase()}`}>
                      <div className="drug-interaction-header">
                        <span className="drug-interaction-pair">{int.medicine_a} + {int.medicine_b}</span>
                        <span className="drug-interaction-severity">{(int.severity || 'mild').toUpperCase()}</span>
                      </div>
                      {int.description && <p className="drug-interaction-desc">{int.description}</p>}
                    </div>
                  ))}
                </div>
                <p className="drug-interactions-disclaimer">
                  {drugInteractions?.disclaimer && String(drugInteractions.disclaimer).trim()
                    ? String(drugInteractions.disclaimer).trim()
                    : tChat(language, 'ui.drugDisclaimer')}
                </p>
                {drugInteractions?.source ? (
                  <p className="drug-interactions-source">
                    {tChat(language, 'ui.ddiSource', { source: drugInteractions.source })}
                  </p>
                ) : null}
              </div>
            </div>
          )}
          {pharmacyResultsDisplay && (
            <div className="message bot">
              <div className="message-avatar">
                <Bot className="avatar-icon" />
              </div>
              <div className="message-content results-message">
                {Array.isArray(pharmacyResultsDisplay.requested_medicines) && pharmacyResultsDisplay.requested_medicines.length > 0 && (
                  <div className="results-medicine-for">
                    💊 <strong>{tChat(language, 'ui.medicinesForSearch')}</strong>{' '}
                    {pharmacyResultsDisplay.requested_medicines.join(', ')}
                  </div>
                )}
                {pharmacyResultsDisplay.from_live_inventory ? (
                  <p className="live-inventory-banner" role="status">
                    📦 {tChat(language, 'ui.liveStockBanner')}
                    {pharmacyResultsDisplay.live_results_note
                      ? ` ${pharmacyResultsDisplay.live_results_note}`
                      : ''}
                  </p>
                ) : null}
                <div className="results-content">
                  {(pharmacyResultsDisplay.resultText || '').split('\n').map((line, index) => {
                    if (line.includes('**') && line.includes('**')) {
                      const boldText = line.match(/\*\*(.*?)\*\*/g)
                      let formattedLine = line
                      boldText?.forEach(bold => {
                        formattedLine = formattedLine.replace(bold, `<strong>${bold.replace(/\*\*/g, '')}</strong>`)
                      })
                      return <p key={index} dangerouslySetInnerHTML={{ __html: formattedLine }} />
                    }
                    if (line.trim() === '') return <br key={index} />
                    return <p key={index}>{line}</p>
                  })}
                </div>
                {pharmacyResultsDisplay.rankingPending && (
                  <p className="ranking-pending-note">⏳ {tChat(language, 'ui.rankingPendingNote')}</p>
                )}
                <ReservationFeedback message={reservationMessage} />
                {(() => {
                  const activeRes = getPrimaryActiveReservation(getPickupSnapshot())
                  if (!activeRes?.pharmacy_name) return null
                  return (
                    <p className="pharmacy-active-reservation-banner" role="status">
                      {tChat(language, 'msg.reservedAtBanner', { pharmacy: activeRes.pharmacy_name })}
                      {activeRes.medicine_name ? ` · ${activeRes.medicine_name}` : ''}
                      {' — '}
                      {formatReservationStatusForPatient(activeRes.status, language)}
                    </p>
                  )
                })()}
                {pharmacyResultsDisplay.responses?.length > 0 && (
                  <div className="pharmacy-reserve-section">
                    {Array.isArray(pharmacyResultsDisplay.requested_medicines) && pharmacyResultsDisplay.requested_medicines.length > 0 && (
                      <p className="pharmacy-reserve-medicines">
                        💊 <strong>{tChat(language, 'ui.medicinesForSearch')}</strong>{' '}
                        {pharmacyResultsDisplay.requested_medicines.join(', ')}
                      </p>
                    )}
                    <p className="pharmacy-reserve-title">
                      {pharmacyResultsDisplay.rankingPending
                        ? tChat(language, 'ui.directionsNow')
                        : pharmacyResultsDisplay.from_live_inventory
                          ? tChat(language, 'ui.reserveLive')
                          : tChat(language, 'ui.reserveTitle')}
                    </p>
                    {pharmacyResultsDisplay.responses.map((pharmacy) => {
                      const snap = getPickupSnapshot()
                      const pharmacyReservation = findPharmacyReservation(snap, pharmacy.pharmacy_id)
                      const isReserved =
                        reservedPharmacies.has(pharmacy.pharmacy_id) ||
                        Boolean(pharmacyReservation) ||
                        pharmacy.has_reservation === true ||
                        Boolean(pharmacy.reservation_id)
                      const breakdown = sortMedsForDisplay(
                        getCombinedPharmacyMedicines(pharmacy, pharmacyResultsDisplay.requested_medicines),
                        pharmacyResultsDisplay.requested_medicines
                      )
                      const availableAtPharmacy = breakdown.filter((m) => medicineRowInStock(m))
                      const singleMedicine = availableAtPharmacy.length === 1
                        ? availableAtPharmacy[0].medicine || availableAtPharmacy[0].medicine_name
                        : null
                      const fallbackMedicine = pharmacyResultsDisplay.live_inventory_medicine || pharmacy.medicine_name || pharmacyResultsDisplay?.requested_medicines?.[0]
                      const requestedMeds = pharmacyResultsDisplay?.requested_medicines
                      const onlyAlternatives = pharmacyOffersOnlyAlternatives(pharmacy, requestedMeds)
                      const pharmacyUnavailable = pharmacyRowBlocksPatientReserve(pharmacy)
                      const canReserve =
                        !pharmacyUnavailable &&
                        (availableAtPharmacy.length > 0 ||
                          (pharmacy.medicine_available !== false &&
                            (!!fallbackMedicine || !!conversationId)))
                      const directionsHint =
                        pharmacy.location_suburb ||
                        pharmacy.location_address ||
                        pharmacy.address ||
                        ''
                      return (
                        <div key={pharmacy.pharmacy_id || pharmacy.pharmacy_name} className="pharmacy-reserve-row">
                          <div className="pharmacy-reserve-info">
                            <span className="pharmacy-reserve-name">{pharmacy.pharmacy_name}</span>
                            {pharmacyUnavailable && (
                              <span className="pharmacy-unavailable-hint" title={pharmacyUnavailablePatientMessage(pharmacy)}>
                                {tChat(language, 'ui.unavailableCall')}
                              </span>
                            )}
                            {pharmacy.distance_km != null && (
                              <span className="pharmacy-reserve-distance">
                                <MapPin size={14} /> {pharmacy.distance_km != null && !Number.isNaN(Number(pharmacy.distance_km)) ? `${Number(pharmacy.distance_km).toFixed(1)} km` : '—'}
                              </span>
                            )}
                          </div>
                          {isReserved ? (
                            <div className="pharmacy-reserve-actions">
                              <span className="pharmacy-reserved-badge">{tChat(language, 'ui.reserved')}</span>
                              <span className="pharmacy-reservation-status">
                                {formatReservationStatusForPatient(
                                  pharmacyReservation?.status ||
                                    pharmacy.reservation_status ||
                                    pharmacy.patient_reservation_status ||
                                    'pending',
                                  language
                                )}
                              </span>
                              <button
                                type="button"
                                className="btn-directions"
                                onClick={() => openDirectionsForPharmacy(pharmacy.pharmacy_name, directionsHint, pharmacy)}
                              >
                                📍 {tChat(language, 'ui.getDirections')}
                              </button>
                            </div>
                          ) : (
                            <div className="pharmacy-reserve-actions">
                              {pharmacyUnavailable && (
                                <button
                                  type="button"
                                  className="btn-call-reserve"
                                  onClick={() =>
                                    promptCallToReserve(
                                      pharmacy,
                                      singleMedicine ||
                                        fallbackMedicine ||
                                        availableAtPharmacy[0]?.medicine ||
                                        availableAtPharmacy[0]?.medicine_name
                                    )
                                  }
                                  title={pharmacyUnavailablePatientMessage(pharmacy)}
                                >
                                  {tChat(language, 'ui.callPharmacy')}
                                </button>
                              )}
                              {canReserve && onlyAlternatives && (
                                <button
                                  type="button"
                                  className="btn-call-reserve"
                                  onClick={() =>
                                    promptCallToReserve(
                                      pharmacy,
                                      singleMedicine ||
                                        fallbackMedicine ||
                                        availableAtPharmacy[0]?.medicine ||
                                        availableAtPharmacy[0]?.medicine_name
                                    )
                                  }
                                  title={tChat(language, 'ui.altReservePhone')}
                                >
                                  {tChat(language, 'ui.callToReserve')}
                                </button>
                              )}
                              {canReserve && !onlyAlternatives && (
                                <>
                                  {availableAtPharmacy.length > 0 ? (
                                    availableAtPharmacy.map((med) => {
                                      const medName = med.medicine || med.medicine_name
                                      if (!medName) return null
                                      const isAlt = medicineRowIsPharmacistAlternative(med, requestedMeds)
                                      if (isAlt) {
                                        return (
                                          <button
                                            key={medName}
                                            type="button"
                                            className="btn-call-reserve btn-reserve-medicine"
                                            onClick={() => promptCallToReserve(pharmacy, medName)}
                                            title={`${medName} is a pharmacist alternative — call to reserve`}
                                          >
                                            {tChat(language, 'ui.callToReserve')} {medName}
                                          </button>
                                        )
                                      }
                                      return (
                                        <button
                                          key={medName}
                                          type="button"
                                          className="btn-reserve btn-reserve-medicine"
                                          onClick={() =>
                                            handleReserve(
                                              pharmacy.pharmacy_id,
                                              pharmacy.pharmacy_name,
                                              medName,
                                              1,
                                              pharmacy
                                            )
                                          }
                                          title={`Reserve ${medName} at this pharmacy`}
                                        >
                                          {tChat(language, 'ui.reserve')} {medName}
                                        </button>
                                      )
                                    })
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn-reserve"
                                      onClick={() =>
                                        handleReserve(
                                          pharmacy.pharmacy_id,
                                          pharmacy.pharmacy_name,
                                          singleMedicine || fallbackMedicine,
                                          1,
                                          pharmacy
                                        )
                                      }
                                    >
                                      {tChat(language, 'ui.reserve')}
                                    </button>
                                  )}
                                </>
                              )}
                              <button
                                type="button"
                                className="btn-directions"
                                onClick={() => openDirectionsForPharmacy(pharmacy.pharmacy_name, directionsHint, pharmacy)}
                              >
                                📍 {tChat(language, 'ui.getDirections')}
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                {!pharmacyResultsDisplay.rankingPending && pharmacyResultsDisplay.responses?.length > 0 && (
                  <div className="pharmacy-ratings">
                    <p className="pharmacy-ratings-title">{tChat(language, 'ui.rateExperience')}</p>
                    {pharmacyResultsDisplay.responses.map((pharmacy) => (
                      <div key={pharmacy.pharmacy_id || pharmacy.pharmacy_name} className="pharmacy-rating-row">
                        <span className="pharmacy-rating-name">{pharmacy.pharmacy_name}</span>
                        <div className="pharmacy-rating-stars">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              className={`star-btn ${ratedPharmacies[pharmacy.pharmacy_id] >= star ? 'filled' : ''}`}
                              onClick={() => handleRatePharmacy(pharmacy.pharmacy_id, pharmacy.pharmacy_name, star, pharmacy.response_id)}
                              title={`Rate ${star} star${star > 1 ? 's' : ''}`}
                            >
                              <Star size={18} fill={ratedPharmacies[pharmacy.pharmacy_id] >= star ? 'currentColor' : 'none'} />
                            </button>
                          ))}
                        </div>
                        {ratedPharmacies[pharmacy.pharmacy_id] && (
                          <span className="pharmacy-rated-badge">{tChat(language, 'ui.rated')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <span className="message-time">
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          )}
          
          {isTyping && (
            <div className="message bot">
              <div className="message-avatar">
                <Bot className="avatar-icon" />
              </div>
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        <div className="chatbot-suggestions">
          <button type="button" className="suggest-chip" onClick={() => document.getElementById('prescription-upload')?.click()}>
            {tChat(language, 'chip.uploadRx')}
          </button>
          <button type="button" className="suggest-chip" onClick={() => setInput(tChat(language, 'chip.input.search'))}>
            {tChat(language, 'chip.searchMed')}
          </button>
          <button type="button" className="suggest-chip" onClick={() => setInput(tChat(language, 'chip.input.symptom'))}>
            {tChat(language, 'chip.symptoms')}
          </button>
          <button type="button" className="suggest-chip" onClick={() => setInput(tChat(language, 'chip.input.nearby'))}>
            {tChat(language, 'chip.nearby')}
          </button>
        </div>

        <div className="chatbot-input">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            style={{ display: 'none' }}
            onChange={handlePrescriptionUpload}
            id="prescription-upload"
          />
          <div className="input-row">
            <input
              type="text"
              placeholder={
                conversationState === 'waiting_for_location'
                  ? tChat(language, 'placeholder.location')
                  : tChat(language, 'placeholder.default')
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              className="chatbot-input-field"
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                type="button"
                className="chatbot-send"
                onClick={() => handleSend()}
                disabled={!input.trim() && conversationState !== 'waiting_for_location'}
              >
                <Send className="icon" />
              </button>
              <button
                type="button"
                className="chatbot-upload"
                onClick={() => document.getElementById('prescription-upload')?.click()}
                title={tChat(language, 'chip.uploadRx')}
              >
                <Upload className="icon" />
              </button>
            </div>
          </div>
          <p className="input-hint">{tChat(language, 'footer.mediBotHint')}</p>
          <p className="chatbot-disclaimer-inline">{tChat(language, 'footer.healthDisclaimer')}</p>
        </div>
      </div>
    </div>
  )
}

export default Chatbot
