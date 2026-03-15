import { createContext, useContext, useState, useEffect } from 'react'

const LANGUAGES = {
  EN: { code: 'EN', name: 'English', flag: '🇬🇧' },
  SN: { code: 'SN', name: 'Shona', flag: '🇿🇼' },
  ND: { code: 'ND', name: 'Ndebele', flag: '🇿🇼' }
}

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    const stored = localStorage.getItem('healthconnect_language')
    return stored || 'EN'
  })

  useEffect(() => {
    localStorage.setItem('healthconnect_language', language)
  }, [language])

  const t = (key, fallback = key) => {
    // Translation map - expand as needed
    const translations = {
      'Find Medicine': { EN: 'Find Medicine', SN: 'Tsvaga Mushonga', ND: 'Thola Umuthi' },
      'Find Your Medicine': { EN: 'Find Your Medicine', SN: 'Tsvaga Mushonga Wako', ND: 'Thola Umuthi Wakho' },
      'Upload Prescription': { EN: 'Upload Prescription', SN: 'Isa Chinyorwa', ND: 'Layisha Isiqinisekiso' },
      'Describe Symptoms': { EN: 'Describe Symptoms', SN: 'Rondedzera Zviratidzo', ND: 'Chaza Impawu' },
      'Search Medicine Directly': { EN: 'Search Medicine Directly', SN: 'Tsvaga Mushonga Zvakananga', ND: 'Sesha Umuthi Ngokuqondile' },
      'Recent Searches': { EN: 'Recent Searches', SN: 'Zvitsva Zvatsvakwa', ND: 'Ukusesha Kwamuva' },
      'Language': { EN: 'Language', SN: 'Mutauro', ND: 'Ulimi' },
      'Home': { EN: 'Home', SN: 'Imba', ND: 'Ikhaya' }
    }
    const map = translations[key]
    if (map && map[language]) return map[language]
    return fallback
  }

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
