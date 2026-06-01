/**
 * Shared i18n core — EN / SN (Shona) / ND (Ndebele).
 */

export function normalizeUiLang(uiLang) {
  const code = String(uiLang || 'EN').toUpperCase()
  if (code === 'SN' || code === 'ND') return code
  return 'EN'
}

export function chatLangApiCode(uiLang) {
  const code = normalizeUiLang(uiLang)
  if (code === 'SN') return 'sn'
  if (code === 'ND') return 'nd'
  return 'en'
}

/** Map patient profile preferred_language to UI code. */
export function profileLangToUi(preferred) {
  const p = String(preferred || '').toLowerCase().trim()
  if (p === 'sn' || p === 'shona') return 'SN'
  if (p === 'nd' || p === 'ndebele') return 'ND'
  return 'EN'
}

export function mergeStringTables(...tables) {
  return Object.assign({}, ...tables)
}

export function createTranslator(stringTable) {
  return function t(uiLang, key, vars = {}) {
    const lang = normalizeUiLang(uiLang)
    const entry = stringTable[key]
    let text = entry?.[lang] || entry?.EN || key
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v ?? ''))
    }
    return text
  }
}
