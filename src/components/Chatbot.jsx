import { useState, useRef, useEffect } from 'react'
import { MessageSquare, Send, X, Bot, User, MapPin, Upload, Clock, Pill, CheckCircle, RotateCcw, Star } from 'lucide-react'
import { sendChatMessage, uploadPrescription, getRankedResponses, pollPharmacyResponses, ratePharmacy, checkDrugInteractions, reserveMedicine, generateSessionId } from '../utils/api'
import './Chatbot.css'

function Chatbot({ isOpen, onClose, initialQuery = '', initialMode = null }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Hello! I'm your AI healthcare assistant. I can help you find medicine by:\n• Searching for a specific medicine\n• Describing your symptoms (e.g., 'I am having a headache')\n• Uploading your prescription\n\nHow can I help you today?",
      sender: 'bot',
      timestamp: new Date(),
      type: 'text'
    }
  ])
  const [input, setInput] = useState(initialQuery)
  const [isTyping, setIsTyping] = useState(false)
  const [conversationState, setConversationState] = useState('initial')
  const [userLocation, setUserLocation] = useState(null)
  const [sessionId, setSessionId] = useState(() => {
    const stored = localStorage.getItem('chatbot_session_id')
    return stored || generateSessionId()
  })
  const [conversationId, setConversationId] = useState(null)
  const [medicineRequestId, setMedicineRequestId] = useState(null)
  const [pollingInterval, setPollingInterval] = useState(null)
  const [pollConfig, setPollConfig] = useState(null) // { poll_url, poll_interval_seconds } from backend
  const [resultsShown, setResultsShown] = useState(false)
  const [pharmacyResultsDisplay, setPharmacyResultsDisplay] = useState(null) // { responses, rankingPending, recommendation }
  const [responseCount, setResponseCount] = useState(0)
  const [pendingVerification, setPendingVerification] = useState(null)
  const [ratedPharmacies, setRatedPharmacies] = useState({}) // { pharmacy_id: rating }
  const [drugInteractions, setDrugInteractions] = useState(null) // { interactions: [...] }
  const [reservationMessage, setReservationMessage] = useState(null) // { type: 'success'|'error', text }
  const [reservedPharmacies, setReservedPharmacies] = useState(new Set()) // pharmacy IDs already reserved this session
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const lastRequestIdRef = useRef(null)
  const searchModeRef = useRef(initialMode)  // symptom | direct | prescription - for backend flow
  const currentRequestIdRef = useRef(null)   // for result isolation - ignore poll results for old requests
  const nextMessageIdRef = useRef(2) // initial greeting uses id 1; every new message gets a unique id

  const genMessageId = () => nextMessageIdRef.current++

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
    if (initialMode) searchModeRef.current = initialMode
  }, [initialMode])

  useEffect(() => {
    if (initialQuery && initialMode === 'direct') {
      handleSend(initialQuery)
    } else if (initialMode === 'symptom') {
      setInput('I am having ')
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

  // Stop polling when chat is closed or component unmounts
  useEffect(() => {
    return () => {
      if (pollingInterval) clearInterval(pollingInterval)
    }
  }, [pollingInterval])

  // Reset when a new medicine request starts; keep currentRequestIdRef for result isolation
  useEffect(() => {
    if (medicineRequestId && medicineRequestId !== lastRequestIdRef.current) {
      setResultsShown(false)
      setPharmacyResultsDisplay(null)
      lastRequestIdRef.current = medicineRequestId
      currentRequestIdRef.current = medicineRequestId
      setPollingInterval(prev => {
        if (prev) clearInterval(prev)
        return null
      })
    }
  }, [medicineRequestId])

  useEffect(() => {
    const hasFinalResults = pharmacyResultsDisplay && !pharmacyResultsDisplay.rankingPending
    if (!medicineRequestId || pollingInterval || hasFinalResults) return

    const intervalMs = (pollConfig?.poll_interval_seconds ?? 10) * 1000
    fetchPharmacyResponses()
    const interval = setInterval(() => {
      fetchPharmacyResponses()
    }, intervalMs)
    setPollingInterval(interval)
    return () => clearInterval(interval)
  }, [medicineRequestId, pollingInterval, pharmacyResultsDisplay, pollConfig])

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
        if (data.event === 'pharmacy_response' && data.medicine_request_id === medicineRequestId) {
          fetchPharmacyResponses()
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

  const getLocation = () => {
    if (navigator.geolocation) {
      setIsTyping(true)
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            address: `Location: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`
          }
          setUserLocation(location)
          setIsTyping(false)
          handleLocationReceived(location)
        },
        (error) => {
          setIsTyping(false)
          askForManualLocation()
        }
      )
    } else {
      askForManualLocation()
    }
  }

  const askForManualLocation = () => {
    const botMessage = {
      id: genMessageId(),
      text: "I couldn't access your location automatically. Please enter your location (e.g., 'Harare, Zimbabwe' or '21 King Street, Harare')",
      sender: 'bot',
      timestamp: new Date(),
      type: 'text'
    }
    setMessages(prev => [...prev, botMessage])
    setConversationState('waiting_for_location')
  }

  const handleLocationReceived = async (location) => {
    const botMessage = {
      id: genMessageId(),
      text: `Great! I found your location: ${location.address || `${location.latitude}, ${location.longitude}`}\n\nNow let me search for pharmacies near you that have the medicine you need...`,
      sender: 'bot',
      timestamp: new Date(),
      type: 'text'
    }
    setMessages(prev => [...prev, botMessage])
    setConversationState('searching_pharmacies')
    
    // Always send coordinates to backend - it needs them to create and broadcast the medicine request
    await sendLocationToBackend(location)
  }

  const sendLocationToBackend = async (location) => {
    try {
      setIsTyping(true)
      const response = await sendChatMessage(
        `My location is ${location.address || `${location.latitude}, ${location.longitude}`}`,
        sessionId,
        conversationId,
        location
      )
      
      setIsTyping(false)
      if (response.medicine_request_id) {
        setMedicineRequestId(response.medicine_request_id)
      }
      if (response.conversation_id) {
        setConversationId(response.conversation_id)
      }
      setPollConfig((response.polling_enabled && response.poll_url && (response.total_responses === 0 || !response.pharmacy_responses?.length))
        ? { poll_url: response.poll_url, poll_interval_seconds: response.poll_interval_seconds ?? 10 }
        : null)
      if (response.pharmacy_responses && response.pharmacy_responses.length > 0) {
        const reqId = response.medicine_request_id || response.results_for_request_id
        const matches = !response.results_for_request_id || response.results_for_request_id === reqId
        if (matches) {
          const rp = response.pharmacy_responses
          const rankingPending = rp?.some(p => p.ranking_pending === true) ?? false
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

          // Always refresh full results card with the latest list
          updatePharmacyResultsDisplay(
            rp,
            response.recommendation || null,
            rankingPending,
            fromLive,
            medName,
            requestedMeds
          )

          // Optional “new arrivals” bubble using new_pharmacy_responses
          if (response.is_new_pharmacy_responses === true) {
            const newList =
              Array.isArray(response.new_pharmacy_responses) && response.new_pharmacy_responses.length
                ? response.new_pharmacy_responses
                : rp

            setMessages(prev => [
              ...prev,
              {
                id: genMessageId(),
                text: response.response || `New response(s) from ${newList.length} pharmacy(ies).`,
                sender: 'bot',
                timestamp: new Date(),
                type: 'new_pharmacy_responses',
                pharmacy_responses: newList
              }
            ])
          }

          // Do not stop polling here; fetchPharmacyResponses controls when to stop based on backend flags
        }
      }
      // Don't manually call fetchPharmacyResponses - let polling handle it
    } catch (error) {
      setIsTyping(false)
      const errorMessage = {
        id: genMessageId(),
        text: "Sorry, I encountered an error. Please try again.",
        sender: 'bot',
        timestamp: new Date(),
        type: 'text'
      }
      setMessages(prev => [...prev, errorMessage])
    }
  }

  const stopPolling = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval)
      setPollingInterval(null)
    }
  }

  const handleNewSearch = async () => {
    stopPolling()
    setMedicineRequestId(null)
    setPharmacyResultsDisplay(null)
    setPollConfig(null)
    setConversationId(null)
    setConversationState('initial')
    setResultsShown(false)
    setRatedPharmacies({})
    setDrugInteractions(null)
    setReservationMessage(null)
    setReservedPharmacies(new Set())
    currentRequestIdRef.current = null
    lastRequestIdRef.current = null
    nextMessageIdRef.current = 2
    const newSessionId = generateSessionId()
    setSessionId(newSessionId)
    setMessages([
      {
        id: 1,
        text: "Let's start a new search. How can I help you? You can search for medicine, describe symptoms, or upload a prescription.",
        sender: 'bot',
        timestamp: new Date(),
        type: 'text'
      }
    ])
    try {
      await sendChatMessage('Start new search', newSessionId, null, null, { start_new_search: true })
    } catch (err) {
      console.error('New search init:', err)
    }
  }

  const medRowKey = (item) =>
    (item?.medicine || item?.medicine_name || '').toString().trim().toLowerCase()

  /** True only when medicine is in stock; false wins over ambiguous sources after merge */
  const medicineRowInStock = (m) => {
    if (m == null) return false
    if (m.available === false || m.available === 'false') return false
    if (m.available === true || m.available === 'true') return true
    const p = m.price
    const hasPrice =
      p != null &&
      String(p).trim() !== '' &&
      String(p).trim().toLowerCase() !== 'n/a' &&
      String(p).trim().toLowerCase() !== 'null'
    return hasPrice
  }

  /** Union rows from multiple API fields so extras (e.g. amoxicillin) are never hidden */
  const mergeMedicineRows = (...lists) => {
    const map = new Map()
    for (const list of lists) {
      if (!Array.isArray(list)) continue
      for (const item of list) {
        const k = medRowKey(item)
        if (!k) continue
        const old = map.get(k)
        if (!old) {
          map.set(k, { ...item })
        } else {
          const oF = old.available === false || old.available === 'false'
          const iF = item.available === false || item.available === 'false'
          const oT = old.available === true || old.available === 'true'
          const iT = item.available === true || item.available === 'true'
          let mergedAvailable
          if (oF || iF) mergedAvailable = false
          else if (oT || iT) mergedAvailable = true
          else mergedAvailable = item.available !== undefined ? item.available : old.available

          map.set(k, {
            ...old,
            ...item,
            price:
              item.price != null && String(item.price).trim() !== ''
                ? item.price
                : old.price,
            quantity:
              item.quantity != null && String(item.quantity).trim() !== ''
                ? item.quantity
                : old.quantity,
            available: mergedAvailable,
          })
        }
      }
    }
    return Array.from(map.values())
  }

  const getCombinedPharmacyMedicines = (pharmacy) =>
    mergeMedicineRows(
      pharmacy.medicine_responses,
      pharmacy.medicines_breakdown,
      pharmacy.medicines
    )

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

  const fetchPharmacyResponses = async () => {
    const requestIdAtStart = medicineRequestId
    if (!requestIdAtStart) return
    try {
      let responses = []
      let resultsForRequestId = null
      let recommendation = null
      let data = null
      if (pollConfig?.poll_url) {
        data = await pollPharmacyResponses(pollConfig.poll_url, conversationId || undefined)
        resultsForRequestId = data?.results_for_request_id || data?.medicine_request_id
        recommendation = data?.recommendation || null
        responses = Array.isArray(data) ? data : (data?.pharmacy_responses || data?.responses || [])
      } else if (conversationId) {
        data = await getRankedResponses(requestIdAtStart, conversationId)
        resultsForRequestId = data?.results_for_request_id || data?.medicine_request_id
        recommendation = data?.recommendation || null
        responses = Array.isArray(data) ? data : (data?.pharmacy_responses || data?.responses || [])
      } else return

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
        updatePharmacyResultsDisplay(responses, recommendation, rankingPending, false, null, requestedMeds)

        // If backend says these include new arrivals, show a small "New response(s)" bubble
        if (data?.is_new_pharmacy_responses === true) {
          const newList = Array.isArray(data.new_pharmacy_responses) && data.new_pharmacy_responses.length
            ? data.new_pharmacy_responses
            : responses

          setMessages(prev => [...prev, {
            id: genMessageId(),
            text: data.response || `New response(s) from ${newList.length} pharmacy(ies).`,
            sender: 'bot',
            timestamp: new Date(),
            type: 'new_pharmacy_responses',
            pharmacy_responses: newList
          }])
        }

        // Stop polling only if backend disables polling or poll_url is gone
        const pollingDisabled = data?.polling_enabled === false
        const hasPollUrl = !!pollConfig?.poll_url
        if (pollingDisabled || !hasPollUrl) {
          stopPolling()
          setResultsShown(true)
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

  const updatePharmacyResultsDisplay = (responses, recommendation = null, rankingPending = false, fromLiveInventory = false, liveInventoryMedicine = null, requestedMedicines = null) => {
    const availablePharmacies = responses.filter(p => p.medicine_available)
    const unavailablePharmacies = responses.filter(p => !p.medicine_available)
    const count = availablePharmacies.length
    const pharmacyWord = count === 1 ? 'pharmacy' : 'pharmacies'

    // Use provided list or derive from medicines_breakdown / medicine_responses
    const resolvedMedicines = (Array.isArray(requestedMedicines) && requestedMedicines.length > 0)
      ? requestedMedicines
      : getMedicineNamesFromResponses(responses)

    // Header based on ranking status
    let resultText = ''
    const medicineLabel = resolvedMedicines.length > 0 ? resolvedMedicines.join(', ') : null
    if (medicineLabel) {
      resultText += `💊 **Searching for:** ${medicineLabel}\n\n`
    }
    if (rankingPending) {
      resultText += `✅ **${count} ${pharmacyWord} have responded. More may respond. Final ranking in 2 minutes.**\n\n`
    } else {
      resultText += `✅ **Great news! ${count} ${pharmacyWord} have responded. Here are the top ranked options.**\n\n`
    }

    // Show recommendation if available (only when final)
    if (!rankingPending && recommendation && recommendation.recommended_pharmacy) {
      resultText += `⭐ **Recommendation:** ${recommendation.reason || `I recommend **${recommendation.recommended_pharmacy}** because it offers the best combination of availability, price, distance, and time.`}\n\n`
    }

    const isRanked = responses.some(p => p.rank !== undefined)
    
    if (isRanked && availablePharmacies.length > 0) {
      
      // Sort by rank if available
      const sortedPharmacies = [...availablePharmacies].sort((a, b) => (a.rank || 0) - (b.rank || 0))
      
      sortedPharmacies.forEach((pharmacy) => {
        const rankIcon = pharmacy.rank === 1 ? '🥇' : pharmacy.rank === 2 ? '🥈' : pharmacy.rank === 3 ? '🥉' : '📍'
        resultText += `${rankIcon} **#${pharmacy.rank || 'N/A'} - ${pharmacy.pharmacy_name}**\n`
        resultText += `   📍 Distance: ${fmtKm(pharmacy.distance_km)} km\n`
        resultText += `   ⏱️ Travel Time: ${pharmacy.estimated_travel_time ?? 'N/A'} min\n`
        resultText += `   ⏳ Preparation Time: ${pharmacy.preparation_time || 0} min\n`
        const totalMin = pharmacy.total_time_minutes
        const totalMinText = totalMin != null && !Number.isNaN(Number(totalMin)) ? `${Number(totalMin)}` : 'N/A'
        resultText += `   🕐 Total Time: ${totalMinText} min\n`
        const scoreStr = fmtScore(pharmacy.ranking_score)
        if (scoreStr != null) {
          resultText += `   ⭐ Score: ${scoreStr}\n`
        }
        const medList = sortMedsForDisplay(
          getCombinedPharmacyMedicines(pharmacy),
          resolvedMedicines
        )
        if (medList.length > 0) {
          resultText += `   💊 **Medicines:**\n`
          medList.forEach((medResp) => {
            const name = medResp.medicine || medResp.medicine_name || '—'
            const inStock = medicineRowInStock(medResp)
            const statusIcon = inStock ? '✅' : '❌'
            resultText += `      ${statusIcon} ${name}: `
            if (inStock) {
              resultText += fmtMedPrice(medResp.price)
              if (medResp.quantity != null) resultText += ` (qty ${medResp.quantity})`
            } else {
              resultText += `Not available`
            }
            if (medResp.alternative) {
              resultText += ` | Alternative: ${medResp.alternative}`
            }
            resultText += `\n`
          })
        } else {
          resultText += `   💰 Price: $${pharmacy.price || 'N/A'}\n`
        }
        
        // Handle alternative medicines with new format (array of objects)
        if (pharmacy.alternative_medicines && pharmacy.alternative_medicines.length > 0) {
          resultText += `   💡 Alternatives: `
          const altList = pharmacy.alternative_medicines.map(alt => {
            // Support both old format (string) and new format (object)
            if (typeof alt === 'string') {
              return alt
            } else if (alt.medicine && alt.suggested_by) {
              return `${alt.medicine} (suggested by ${alt.suggested_by})`
            } else if (alt.medicine) {
              return alt.medicine
            }
            return alt
          }).filter(Boolean)
          resultText += altList.join(', ') + '\n'
        }
        
        if (pharmacy.notes) {
          resultText += `   📝 Notes: ${pharmacy.notes}\n`
        }
        resultText += `\n`
      })
    } else if (availablePharmacies.length > 0) {
      // Old format - fallback
      resultText += `✅ **Available at ${availablePharmacies.length} pharmacy(ies):**\n\n`
      availablePharmacies.forEach((pharmacy, index) => {
        resultText += `${index + 1}. **${pharmacy.pharmacy_name}**\n`
        resultText += `   📍 Distance: ${fmtKm(pharmacy.distance_km)} km\n`
        resultText += `   ⏱️ Travel Time: ${pharmacy.estimated_travel_time ?? 'N/A'} min\n`
        resultText += `   💰 Price: ${fmtMedPrice(pharmacy.price)}\n`
        resultText += `   ⏳ Preparation Time: ${pharmacy.preparation_time || 0} min\n`
        const totalMinFb = pharmacy.total_time_minutes
        resultText += `   🕐 Total Time: ${totalMinFb != null && !Number.isNaN(Number(totalMinFb)) ? Number(totalMinFb) : 'N/A'} min\n`
        const fallbackMedList = sortMedsForDisplay(
          getCombinedPharmacyMedicines(pharmacy),
          resolvedMedicines
        )
        if (fallbackMedList.length > 0) {
          resultText += `   💊 **Medicines:**\n`
          fallbackMedList.forEach((medResp) => {
            const name = medResp.medicine || medResp.medicine_name || '—'
            const inStock = medicineRowInStock(medResp)
            const statusIcon = inStock ? '✅' : '❌'
            resultText += `      ${statusIcon} ${name}: ${inStock ? `${fmtMedPrice(medResp.price)}${medResp.quantity != null ? ` (qty ${medResp.quantity})` : ''}` : 'Not available'}\n`
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

    setPharmacyResultsDisplay(prev => ({
      responses,
      recommendation,
      rankingPending,
      resultText,
      from_live_inventory: fromLiveInventory,
      live_inventory_medicine: liveInventoryMedicine,
      requested_medicines: resolvedMedicines.length > 0 ? resolvedMedicines : (prev?.requested_medicines || [])
    }))
    setConversationState('showing_results')

    if (!rankingPending) {
      stopPolling()
      setResultsShown(true)
    }
  }

  const handleReserve = async (pharmacyId, pharmacyName, medicineName, quantity = 1) => {
    setReservationMessage(null)
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
        setReservationMessage({ type: 'error', text: 'Medicine name is missing.' })
        return
      }
      const result = await reserveMedicine({
        pharmacy_id: pharmacyId,
        ...(medicine && { medicine_name: medicine }),
        quantity,
        conversation_id: conversationId || undefined,
        session_id: sessionId || undefined,
      })
      setReservationMessage({ type: 'success', text: result.message || `Reserved at ${pharmacyName}. Please pick up within 2 hours.` })
      setReservedPharmacies(prev => new Set([...prev, pharmacyId]))
    } catch (err) {
      setReservationMessage({ type: 'error', text: err.message || 'Reserve failed.' })
    }
  }

  const openDirections = (pharmacyName, suburbOrAddress) => {
    const query = encodeURIComponent(`${pharmacyName} ${suburbOrAddress || ''}`)
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank')
  }

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

    // Handle location input
    if (conversationState === 'waiting_for_location') {
      const location = {
        address: text,
        latitude: null,
        longitude: null
      }
      setUserLocation(location)
      setConversationState('searching_pharmacies')
      
      const userMessage = {
        id: genMessageId(),
        text: text,
        sender: 'user',
        timestamp: new Date(),
        type: 'text'
      }
      setMessages(prev => [...prev, userMessage])
      
      setIsTyping(true)
    try {
      // Debug: Log what we're sending
      console.log('[Chatbot] Sending location with:', {
        message: `My location is ${text}`,
        sessionId,
        conversationId,
        location
      })
      
      const response = await sendChatMessage(
        `My location is ${text}`,
        sessionId,
        conversationId,
        location
      )
      
      // Debug: Log response
      console.log('[Chatbot] Location response:', {
        conversation_id: response.conversation_id,
        medicine_request_id: response.medicine_request_id,
        pharmacy_responses_count: response.pharmacy_responses?.length || 0,
        request_sent_to_pharmacies: response.request_sent_to_pharmacies
      })
      
      if (response.conversation_id) {
        setConversationId(response.conversation_id)
      }
      if (response.medicine_request_id) {
        setMedicineRequestId(response.medicine_request_id)
      }
      setPollConfig((response.polling_enabled && response.poll_url && (response.total_responses === 0 || !response.pharmacy_responses?.length))
        ? { poll_url: response.poll_url, poll_interval_seconds: response.poll_interval_seconds ?? 10 }
        : null)

        const botMessage = {
          id: genMessageId(),
          text: response.response || `Perfect! Location saved: ${text}\n\nNow searching for pharmacies near you...`,
          sender: 'bot',
          timestamp: new Date(),
          type: 'text'
        }
        setMessages(prev => [...prev, botMessage])
        
        if (response.medicine_request_id) {
          const reqId = response.medicine_request_id || response.results_for_request_id
          const matches = !response.results_for_request_id || response.results_for_request_id === reqId
          if (response.pharmacy_responses && response.pharmacy_responses.length > 0 && matches) {
            const rp = response.pharmacy_responses
            const rankingPending = rp.some(p => p.ranking_pending === true)
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

            // Always refresh full results card
            updatePharmacyResultsDisplay(
              rp,
              response.recommendation || null,
              rankingPending,
              fromLive,
              medName,
              requestedMeds
            )

            // Optional new-arrivals bubble
            if (response.is_new_pharmacy_responses === true) {
              const newList =
                Array.isArray(response.new_pharmacy_responses) && response.new_pharmacy_responses.length
                  ? response.new_pharmacy_responses
                  : rp

              setMessages(prev => [
                ...prev,
                {
                  id: genMessageId(),
                  text: response.response || `New response(s) from ${newList.length} pharmacy(ies).`,
                  sender: 'bot',
                  timestamp: new Date(),
                  type: 'new_pharmacy_responses',
                  pharmacy_responses: newList
                }
              ])
            }

            // Do not stop polling here; fetchPharmacyResponses controls when to stop based on backend flags
          }
          // Don't manually call fetchPharmacyResponses - let polling handle it
        }
      } catch (error) {
        const errorMessage = {
          id: genMessageId(),
          text: "Sorry, I encountered an error processing your location. Please try again.",
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
        options
      )

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

      const botMessage = {
        id: genMessageId(),
        text: response.response,
        sender: 'bot',
        timestamp: new Date(),
        type: askConfirmation && suggestedMedicines?.length ? 'medicine_suggestion' : 'text',
        suggested_medicines: suggestedMedicines,
        actions: askConfirmation && suggestedMedicines?.length
          ? ['Yes, search for these medicines', 'No, let me describe differently']
          : undefined
      }
      setMessages(prev => [...prev, botMessage])

      if (askConfirmation && suggestedMedicines?.length) {
        setConversationState('awaiting_medicine_confirmation')
        if (suggestedMedicines.length >= 2) {
          checkDrugInteractions(suggestedMedicines).then(data => setDrugInteractions(data)).catch(() => {})
        }
      }

      // Debug: Log the response
      console.log('[Chatbot] Response received:', {
        conversation_id: response.conversation_id,
        medicine_request_id: response.medicine_request_id,
        requires_location: response.requires_location,
        has_user_location: !!userLocation,
        pharmacy_responses_count: response.pharmacy_responses?.length || 0
      })

      // Check if location is required (only when not awaiting medicine confirmation)
      if (!askConfirmation && response.requires_location && !userLocation) {
        setConversationState('waiting_for_location')
        const locationPrompt = {
          id: genMessageId(),
          text: "To find pharmacies near you, I need your location. Would you like me to use your current location?",
          sender: 'bot',
          timestamp: new Date(),
          type: 'location_prompt',
          actions: ['Use My Location', 'Enter Manually']
        }
        setMessages(prev => [...prev, locationPrompt])
      } else if (!askConfirmation && response.medicine_request_id) {
        const reqId = response.medicine_request_id || response.results_for_request_id
        const matches = !response.results_for_request_id || response.results_for_request_id === reqId
        if (response.pharmacy_responses && response.pharmacy_responses.length > 0 && matches) {
          const rp = response.pharmacy_responses
          const rankingPending = rp.some(p => p.ranking_pending === true)
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

          // Always refresh full results card
          updatePharmacyResultsDisplay(
            rp,
            response.recommendation || null,
            rankingPending,
            fromLive,
            medName,
            requestedMeds
          )

          // Optional new-arrivals bubble
          if (response.is_new_pharmacy_responses === true) {
            const newList =
              Array.isArray(response.new_pharmacy_responses) && response.new_pharmacy_responses.length
                ? response.new_pharmacy_responses
                : rp

            setMessages(prev => [
              ...prev,
              {
                id: genMessageId(),
                text: response.response || `New response(s) from ${newList.length} pharmacy(ies).`,
                sender: 'bot',
                timestamp: new Date(),
                type: 'new_pharmacy_responses',
                pharmacy_responses: newList
              }
            ])
          }

          // Do not stop polling here; fetchPharmacyResponses controls when to stop based on backend flags
        } else if (matches) {
          setPollConfig((response.polling_enabled && response.poll_url && (response.total_responses === 0 || !response.pharmacy_responses?.length))
            ? { poll_url: response.poll_url, poll_interval_seconds: response.poll_interval_seconds ?? 10 }
            : null)
          setConversationState('searching_pharmacies')
          const searchingMessage = {
            id: genMessageId(),
            text: "Request has been sent. Waiting for pharmacies to respond. Responses will appear as soon as pharmacies reply.",
            sender: 'bot',
            timestamp: new Date(),
            type: 'text'
          }
          setMessages(prev => [...prev, searchingMessage])
        }
      }
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage = {
        id: genMessageId(),
        text: "Sorry, I encountered an error. Please try again.",
        sender: 'bot',
        timestamp: new Date(),
        type: 'text'
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsTyping(false)
    }
  }

  const handlePrescriptionUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    const userMessage = {
      id: genMessageId(),
      text: `📄 Prescription uploaded: ${file.name}`,
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
        userLocation
      )

      if (result.conversation_id) {
        setConversationId(result.conversation_id)
      }
      if (result.medicine_request_id) {
        setMedicineRequestId(result.medicine_request_id)
      }
      setPollConfig((result.polling_enabled && result.poll_url && (result.total_responses === 0 || !result.pharmacy_responses?.length))
        ? { poll_url: result.poll_url, poll_interval_seconds: result.poll_interval_seconds ?? 10 }
        : null)

      const confidence = typeof result.confidence === 'number' ? result.confidence : 95
      const needsVerification = typeof confidence === 'number' && confidence < 90

      let botText = `I've processed your prescription!\n\n`
      if (result.medicines && result.medicines.length > 0) {
        botText += `**Medicines found:**\n${result.medicines.map((med, idx) => `${idx + 1}. ${med}`).join('\n')}\n\n`
      }
      if (result.dosages) {
        botText += `**Dosages:**\n${Object.entries(result.dosages).map(([med, dose]) => `${med}: ${dose}`).join('\n')}\n\n`
      }
      botText += `**Confidence:** ${typeof confidence === 'number' ? `${confidence}%` : (result.confidence || 'N/A')}\n\n`

      if (needsVerification) {
        botText += `⚠️ Low confidence (<90%). Please verify the extracted medicines are correct.\n\n`
        setPendingVerification({ medicines: result.medicines || [], dosages: result.dosages || {}, rawResult: result })
      }

      if (result.medicines && result.medicines.length >= 2 && !needsVerification) {
        checkDrugInteractions(result.medicines).then(data => setDrugInteractions(data)).catch(() => {})
      }
      if (result.medicine_request_id && !needsVerification) {
        botText += `I'm now searching for pharmacies that can fulfill this prescription...`
        setConversationState('searching_pharmacies')
        fetchPharmacyResponses()
      } else if (!needsVerification && result.requires_location && !userLocation) {
        botText += `To find pharmacies, I need your location.`
        setConversationState('waiting_for_location')
      }

      const botMessage = {
        id: genMessageId(),
        text: botText,
        sender: 'bot',
        timestamp: new Date(),
        type: needsVerification ? 'verify_prescription' : 'text',
        verifyData: needsVerification ? { medicines: result.medicines, dosages: result.dosages, rawResult: result } : null,
        actions: needsVerification ? ['Confirm', 'Edit Manually'] : undefined
      }
      setMessages(prev => [...prev, botMessage])

      if (needsVerification) {
        setConversationState('awaiting_verification')
      } else if (!needsVerification && result.requires_location && !userLocation) {
        const locationPrompt = {
          id: genMessageId(),
          text: "Would you like me to use your current location?",
          sender: 'bot',
          timestamp: new Date(),
          type: 'location_prompt',
          actions: ['Use My Location', 'Enter Manually']
        }
        setMessages(prev => [...prev, locationPrompt])
      }
    } catch (error) {
      console.error('Error uploading prescription:', error)
      // Extract error message from API response or use default
      let errorText = "Sorry, I couldn't process your prescription. Please make sure the image is clear and try again."
      
      if (error.message) {
        // Use the error message from the API
        errorText = error.message
      } else if (error.error) {
        // Handle error object with error property
        errorText = error.error
      }
      
      const errorMessage = {
        id: genMessageId(),
        text: errorText,
        sender: 'bot',
        timestamp: new Date(),
        type: 'text'
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsTyping(false)
    }
  }

  const handleQuickAction = async (action, message) => {
    if (action === 'Use My Location') {
      getLocation()
    } else if (action === 'Enter Manually') {
      askForManualLocation()
    } else if (action === 'Yes, search for these medicines' && message?.suggested_medicines?.length) {
      const medicines = message.suggested_medicines
      const confirmMessage = `Yes, please search for ${medicines.join(', ')}`
      setConversationState('initial')
      await handleSend(confirmMessage)
    } else if (action === 'No, let me describe differently') {
      setConversationState('initial')
      const prompt = {
        id: genMessageId(),
        text: "No problem. Please describe your symptoms again, and I'll suggest different options.",
        sender: 'bot',
        timestamp: new Date(),
        type: 'text'
      }
      setMessages(prev => [...prev, prompt])
    } else if (action === 'Confirm' && message?.verifyData) {
      setPendingVerification(null)
      const raw = message.verifyData.rawResult
      if (raw?.medicines && raw.medicines.length >= 2) {
        checkDrugInteractions(raw.medicines).then(data => setDrugInteractions(data)).catch(() => {})
      }
      if (raw?.requires_location && !userLocation) {
        setConversationState('waiting_for_location')
        const prompt = {
          id: genMessageId(),
          text: "Medicines confirmed. To find pharmacies, please share your location.",
          sender: 'bot',
          timestamp: new Date(),
          type: 'location_prompt',
          actions: ['Use My Location', 'Enter Manually']
        }
        setMessages(prev => [...prev, prompt])
      } else if (raw?.medicine_request_id) {
        setMedicineRequestId(raw.medicine_request_id)
        setConversationState('searching_pharmacies')
        fetchPharmacyResponses()
      }
    } else if (action === 'Edit Manually') {
      setPendingVerification(null)
      const prompt = {
        id: genMessageId(),
        text: "Please type the medicine names you need (comma-separated), e.g.: Amoxicillin 500mg, Paracetamol 500mg",
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
              <h3>MediBot — AI Health Assistant</h3>
              <p className="bot-status">Online · Responds instantly</p>
            </div>
          </div>
          <div className="chatbot-header-actions">
            <button type="button" className="chatbot-new-search" onClick={handleNewSearch} title="Start new search">
              <RotateCcw className="icon" size={16} />
              New Conversation
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
                <div className="msg-sender">{message.sender === 'bot' ? 'MediBot' : 'You'}</div>
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
                    <div className="new-responses-label">New response(s)</div>
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
                          const medList = getCombinedPharmacyMedicines(pharmacy)
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
                                onClick={() => openDirections(pharmacy.pharmacy_name, directionsHint)}
                              >
                                Get directions
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <p>{message.text}</p>
                )}
                {message.type === 'medicine_suggestion' && message.suggested_medicines?.length > 0 && (
                  <div className="suggested-medicines">
                    {message.suggested_medicines.map((med, idx) => (
                      <span key={idx} className="medicine-chip">{med}</span>
                    ))}
                  </div>
                )}
                {message.actions && (
                  <div className="message-actions">
                    {message.actions.map((action, index) => (
                      <button
                        key={index}
                        className="action-button"
                        onClick={() => handleQuickAction(action, message)}
                      >
                        {action === 'Use My Location' && <MapPin className="action-icon" />}
                        {action}
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
                <p className="drug-interactions-title">⚠️ Drug interaction check</p>
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
                <p className="drug-interactions-disclaimer">Always consult your doctor or pharmacist before combining medicines.</p>
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
                    💊 <strong>Medicines for this search:</strong> {pharmacyResultsDisplay.requested_medicines.join(', ')}
                  </div>
                )}
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
                  <p className="ranking-pending-note">⏳ Final ranking in 2 minutes. Keep this chat open to see updates.</p>
                )}
                {reservationMessage && (
                  <p className={`reservation-feedback ${reservationMessage.type === 'success' ? 'reservation-success' : 'reservation-error'}`}>
                    {reservationMessage.text}
                  </p>
                )}
                {pharmacyResultsDisplay.responses?.length > 0 && (
                  <div className="pharmacy-reserve-section">
                    {Array.isArray(pharmacyResultsDisplay.requested_medicines) && pharmacyResultsDisplay.requested_medicines.length > 0 && (
                      <p className="pharmacy-reserve-medicines">💊 <strong>Medicine(s):</strong> {pharmacyResultsDisplay.requested_medicines.join(', ')}</p>
                    )}
                    <p className="pharmacy-reserve-title">
                      {pharmacyResultsDisplay.rankingPending
                        ? 'Get directions now — ranking can still change in ~2 minutes'
                        : pharmacyResultsDisplay.from_live_inventory
                          ? 'Reserve at pharmacy (pick up within 2 hours) — choose which medicine to reserve, or get directions'
                          : 'Reserve at a pharmacy (where available) or get directions — pick up within 2 hours'}
                    </p>
                    {pharmacyResultsDisplay.responses.map((pharmacy) => {
                      const isReserved = reservedPharmacies.has(pharmacy.pharmacy_id)
                      const breakdown = sortMedsForDisplay(
                        getCombinedPharmacyMedicines(pharmacy),
                        pharmacyResultsDisplay.requested_medicines
                      )
                      const availableAtPharmacy = breakdown.filter((m) => medicineRowInStock(m))
                      const singleMedicine = availableAtPharmacy.length === 1
                        ? availableAtPharmacy[0].medicine || availableAtPharmacy[0].medicine_name
                        : null
                      const fallbackMedicine = pharmacyResultsDisplay.live_inventory_medicine || pharmacy.medicine_name || pharmacyResultsDisplay?.requested_medicines?.[0]
                      const canReserve =
                        pharmacy.medicine_available !== false &&
                        (availableAtPharmacy.length > 0 || !!fallbackMedicine || !!conversationId)
                      const directionsHint =
                        pharmacy.location_suburb ||
                        pharmacy.location_address ||
                        pharmacy.address ||
                        ''
                      return (
                        <div key={pharmacy.pharmacy_id || pharmacy.pharmacy_name} className="pharmacy-reserve-row">
                          <div className="pharmacy-reserve-info">
                            <span className="pharmacy-reserve-name">{pharmacy.pharmacy_name}</span>
                            {pharmacy.distance_km != null && (
                              <span className="pharmacy-reserve-distance">
                                <MapPin size={14} /> {pharmacy.distance_km != null && !Number.isNaN(Number(pharmacy.distance_km)) ? `${Number(pharmacy.distance_km).toFixed(1)} km` : '—'}
                              </span>
                            )}
                          </div>
                          {isReserved ? (
                            <div className="pharmacy-reserve-actions">
                              <span className="pharmacy-reserved-badge">Reserved</span>
                              <button
                                type="button"
                                className="btn-directions"
                                onClick={() => openDirections(pharmacy.pharmacy_name, directionsHint)}
                              >
                                📍 Get directions
                              </button>
                            </div>
                          ) : (
                            <div className="pharmacy-reserve-actions">
                              {canReserve && (
                                <>
                                  {availableAtPharmacy.length > 0 ? (
                                    availableAtPharmacy.map((med) => {
                                      const medName = med.medicine || med.medicine_name
                                      if (!medName) return null
                                      return (
                                        <button
                                          key={medName}
                                          type="button"
                                          className="btn-reserve btn-reserve-medicine"
                                          onClick={() => handleReserve(pharmacy.pharmacy_id, pharmacy.pharmacy_name, medName, 1)}
                                          title={`Reserve ${medName} at this pharmacy`}
                                        >
                                          Reserve {medName}
                                        </button>
                                      )
                                    })
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn-reserve"
                                      onClick={() => handleReserve(
                                        pharmacy.pharmacy_id,
                                        pharmacy.pharmacy_name,
                                        singleMedicine || fallbackMedicine,
                                        1
                                      )}
                                    >
                                      Reserve
                                    </button>
                                  )}
                                </>
                              )}
                              <button
                                type="button"
                                className="btn-directions"
                                onClick={() => openDirections(pharmacy.pharmacy_name, directionsHint)}
                              >
                                📍 Get directions
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
                    <p className="pharmacy-ratings-title">Rate your experience</p>
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
                          <span className="pharmacy-rated-badge">Rated</span>
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
          <button type="button" className="suggest-chip" onClick={() => document.getElementById('prescription-upload')?.click()}>📸 Upload Prescription</button>
          <button type="button" className="suggest-chip" onClick={() => setInput('I need ')}>🔍 Search Medicine</button>
          <button type="button" className="suggest-chip" onClick={() => setInput('I have a headache')}>💊 Describe Symptoms</button>
          <button type="button" className="suggest-chip" onClick={() => setInput('Find pharmacy near me')}>📍 Find Nearby Pharmacy</button>
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
              placeholder={conversationState === 'waiting_for_location' ? "Enter your location..." : "Ask about medicine, symptoms, or upload a prescription..."}
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
                title="Upload Prescription"
              >
                <Upload className="icon" />
              </button>
            </div>
          </div>
          <p className="input-hint">MediBot can make mistakes. For emergencies, call your local health centre.</p>
          <p className="chatbot-disclaimer-inline">⚠️ General health info only — consult a healthcare provider for medical advice.</p>
        </div>
      </div>
    </div>
  )
}

export default Chatbot
