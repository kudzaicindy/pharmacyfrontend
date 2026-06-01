/**
 * Deduplicates patient ranked/poll HTTP calls so only one request runs per key at a time,
 * with a minimum gap between completed fetches (stops burst / StrictMode double-fire).
 */

const inflight = new Map()
const lastCompletedAt = new Map()

export const RANKED_MIN_GAP_MS = 5000

export function rankedFetchKey(requestId, conversationId, pollUrl = null) {
  if (pollUrl) return `poll:${String(pollUrl)}`
  return `ranked:${String(requestId)}:${String(conversationId)}`
}

export function clearRankedFetchGate(requestId, conversationId) {
  if (requestId && conversationId) {
    lastCompletedAt.delete(rankedFetchKey(requestId, conversationId))
    inflight.delete(rankedFetchKey(requestId, conversationId))
  }
  for (const key of [...inflight.keys(), ...lastCompletedAt.keys()]) {
    if (requestId && key.includes(String(requestId))) {
      inflight.delete(key)
      lastCompletedAt.delete(key)
    }
  }
}

/**
 * @param {string} key
 * @param {() => Promise<unknown>} fetcher
 * @param {{ force?: boolean, minGapMs?: number }} [opts]
 * @returns {Promise<unknown|null>} null when skipped (too soon / duplicate)
 */
export async function fetchRankedGated(key, fetcher, opts = {}) {
  const minGapMs = opts.minGapMs ?? RANKED_MIN_GAP_MS
  const now = Date.now()
  const last = lastCompletedAt.get(key) || 0

  if (inflight.has(key)) {
    return inflight.get(key)
  }

  if (!opts.force && now - last < minGapMs) {
    return null
  }

  const promise = (async () => {
    try {
      return await fetcher()
    } finally {
      lastCompletedAt.set(key, Date.now())
      inflight.delete(key)
    }
  })()

  inflight.set(key, promise)
  return promise
}
