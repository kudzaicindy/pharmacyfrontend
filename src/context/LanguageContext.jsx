import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { t as translate, profileLangToUi, chatLangApiCode } from '../utils/i18n'

const LANGUAGES = {
  EN: { code: 'EN', name: 'English', flag: '🇬🇧' },
  SN: { code: 'SN', name: 'Shona', flag: '🇿🇼' },
  ND: { code: 'ND', name: 'Ndebele', flag: '🇿🇼' },
}

const LanguageContext = createContext(null)

function readStoredLanguage() {
  try {
    const stored = localStorage.getItem('healthconnect_language')
    if (stored && LANGUAGES[stored]) return stored
    const patient = JSON.parse(localStorage.getItem('patient') || '{}')
    if (patient?.preferred_language) {
      return profileLangToUi(patient.preferred_language)
    }
  } catch {
    /* ignore */
  }
  return 'EN'
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(readStoredLanguage)

  useEffect(() => {
    localStorage.setItem('healthconnect_language', language)
    const api = chatLangApiCode(language)
    document.documentElement.lang = api
  }, [language])

  const t = useCallback((key, vars) => translate(language, key, vars), [language])

  return (
    <LanguageContext.Provider value={{ language, setLanguage, languages: LANGUAGES, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
