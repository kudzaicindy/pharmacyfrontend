import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Search, MessageSquare, Menu, X } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import Chatbot from '../components/Chatbot'
import './LandingPage.css'

const HERO_PILLS = ['Amoxicillin', 'Metformin', 'Insulin', 'Ibuprofen', 'Vitamin C']

function LandingPage() {
  const { language, setLanguage, languages, t } = useLanguage()
  const [showChatbot, setShowChatbot] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [initialQuery, setInitialQuery] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const navRef = useRef(null)

  useEffect(() => {
    const handleScroll = () => {
      if (navRef.current) navRef.current.classList.toggle('solid', window.scrollY > 50)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const openSearch = (query = '') => {
    setInitialQuery(query || searchInput.trim())
    setShowChatbot(true)
  }

  return (
    <div className="landing-page lp-v2">
      <nav className="lp-nav" id="nav" ref={navRef}>
        <div className="logo">Medi<span>Connect</span></div>
        <ul className="nav-links">
          <li><a href="#how">How It Works</a></li>
          <li><a href="#features">Features</a></li>
          <li><a href="#pharmacies">Pharmacies</a></li>
        </ul>
        <div className="nav-right">
          <div className="nav-lang">
            <label className="nav-lang-label" htmlFor="lp-lang-select">{t('Language')}:</label>
            <select
              id="lp-lang-select"
              className="nav-lang-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              aria-label={t('Language')}
            >
              {Object.entries(languages).map(([code, { name, flag }]) => (
                <option key={code} value={code}>{flag} {name}</option>
              ))}
            </select>
          </div>
          <Link to="/login" className="nav-ghost">Sign In</Link>
          <Link to="/register" className="nav-solid-btn">Get Started →</Link>
        </div>
        <button
          type="button"
          className="lp-hamburger"
          onClick={() => setMobileMenuOpen((o) => !o)}
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </nav>

      <div
        className={`lp-mobile-menu ${mobileMenuOpen ? 'lp-mobile-menu-open' : ''}`}
        aria-hidden={!mobileMenuOpen}
        onClick={(e) => e.target === e.currentTarget && setMobileMenuOpen(false)}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
      >
        <ul className="lp-mobile-nav">
          <li><a href="#how" onClick={() => setMobileMenuOpen(false)}>How It Works</a></li>
          <li><a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a></li>
          <li><a href="#pharmacies" onClick={() => setMobileMenuOpen(false)}>Pharmacies</a></li>
        </ul>
        <div className="lp-mobile-actions">
          <div className="nav-lang lp-mobile-lang">
            <label className="nav-lang-label" htmlFor="lp-lang-select-mobile">{t('Language')}:</label>
            <select
              id="lp-lang-select-mobile"
              className="nav-lang-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              aria-label={t('Language')}
            >
              {Object.entries(languages).map(([code, { name, flag }]) => (
                <option key={code} value={code}>{flag} {name}</option>
              ))}
            </select>
          </div>
          <Link to="/login" className="nav-ghost" onClick={() => setMobileMenuOpen(false)}>Sign In</Link>
          <Link to="/register" className="nav-solid-btn" onClick={() => setMobileMenuOpen(false)}>Get Started →</Link>
        </div>
      </div>

      <section className="hero">
        <div className="hero-img" />
        <div className="hero-overlay" />
        <div className="hero-teal-wash" />
        <div className="hero-grain" />
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="hero-deco" aria-hidden="true">
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <path d="M 900 -100 Q 1600 200 1500 700" stroke="rgba(45,212,191,0.12)" strokeWidth="1.5" fill="none" />
            <path d="M 950 -80 Q 1650 220 1550 720" stroke="rgba(45,212,191,0.07)" strokeWidth="1" fill="none" />
            <circle cx="1200" cy="420" r="260" stroke="rgba(45,212,191,0.09)" strokeWidth="1.5" fill="none" />
            <circle cx="1200" cy="420" r="195" stroke="rgba(45,212,191,0.13)" strokeWidth="1" strokeDasharray="8 7" fill="none" />
            <circle cx="1200" cy="420" r="120" stroke="rgba(45,212,191,0.18)" strokeWidth="1.5" fill="none" />
            <circle cx="1200" cy="420" r="55" fill="rgba(13,148,136,0.12)" stroke="rgba(45,212,191,0.35)" strokeWidth="1.5" />
            <line x1="1200" y1="400" x2="1200" y2="440" stroke="rgba(45,212,191,0.5)" strokeWidth="2" strokeLinecap="round" />
            <line x1="1180" y1="420" x2="1220" y2="420" stroke="rgba(45,212,191,0.5)" strokeWidth="2" strokeLinecap="round" />
            <circle cx="1200" cy="160" r="5" fill="rgba(45,212,191,0.45)" />
            <circle cx="1460" cy="420" r="4" fill="rgba(45,212,191,0.35)" />
            <circle cx="1200" cy="680" r="5" fill="rgba(13,148,136,0.4)" />
            <circle cx="940" cy="420" r="3" fill="rgba(255,255,255,0.2)" />
            <circle cx="1390" cy="195" r="3.5" fill="rgba(245,158,11,0.5)" />
            <circle cx="1380" cy="640" r="3" fill="rgba(45,212,191,0.3)" />
            <path id="ct" d="M 960 420 A 240 240 0 1 1 960.1 420.1" fill="none" />
            <text fontSize="9" fill="rgba(255,255,255,0.14)" fontFamily="sans-serif" letterSpacing="5.5">
              <textPath href="#ct" startOffset="5%">MEDICINE · HEALTH · PHARMACY · ZIMBABWE · CARE · AI · </textPath>
            </text>
            <path d="M -100 750 Q 300 600 600 820 Q 800 950 1000 800" stroke="rgba(13,148,136,0.08)" strokeWidth="2" fill="none" />
            <circle cx="80" cy="200" r="2.5" fill="rgba(255,255,255,0.15)" />
            <circle cx="200" cy="600" r="2" fill="rgba(45,212,191,0.2)" />
            <circle cx="400" cy="150" r="3" fill="rgba(13,148,136,0.25)" />
            <circle cx="600" cy="750" r="2" fill="rgba(255,255,255,0.1)" />
            <circle cx="750" cy="80" r="2.5" fill="rgba(245,158,11,0.3)" />
            <rect x="1080" y="320" width="60" height="20" rx="10" fill="none" stroke="rgba(45,212,191,0.2)" strokeWidth="1" />
            <rect x="1260" y="500" width="48" height="16" rx="8" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
          </svg>
        </div>

        <div className="hero-content">
          <div className="badge">
            <span className="badge-dot" />
            <span>AI-Powered · Zimbabwe Medicine Platform</span>
          </div>
          <h1>
            <span className="h1-line">Find Your</span>
            <span className="h1-line"><em>Medicine,</em></span>
            <span className="h1-line"><span className="underline-wrap">Instantly.</span></span>
          </h1>
          <p className="hero-desc">
            MediConnect connects patients with pharmacies across Zimbabwe in seconds. Search any medicine, check real-time stock, and get there fast — powered by AI.
          </p>

          <div className="search-box">
            <Search size={18} strokeWidth={2} className="search-icon" />
            <input
              type="text"
              placeholder="Search medicine, e.g. Paracetamol 500mg…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && openSearch()}
            />
            <button type="button" className="s-btn" onClick={() => openSearch()}>Search →</button>
          </div>

          <div className="pills-row">
            <span className="pills-label">Try:</span>
            {HERO_PILLS.map((name) => (
              <button key={name} type="button" className="pill" onClick={() => openSearch(name)}>{name}</button>
            ))}
          </div>

          <div className="stats">
            <div className="stat">
              <div className="stat-n">200<sup>+</sup></div>
              <div className="stat-l">Pharmacies</div>
            </div>
            <div className="stat">
              <div className="stat-n">5k<sup>+</sup></div>
              <div className="stat-l">Medicines</div>
            </div>
            <div className="stat">
              <div className="stat-n">12<sup>+</sup></div>
              <div className="stat-l">Cities</div>
            </div>
          </div>
        </div>

        <div className="hero-card">
          <div className="card-glass">
            <div className="card-top">
              <div className="card-avatar">🤖</div>
              <div>
                <div className="card-name">MediBot AI</div>
                <div className="card-sub">Your health assistant</div>
              </div>
              <div className="online"><span className="od" />Live</div>
            </div>
            <div className="bubble user-bubble">Where can I find Metformin near Harare CBD?</div>
            <div className="bubble bot-bubble">Found <strong>3 pharmacies</strong> near you with Metformin 500mg in stock!</div>
            <div className="typing-bubble"><span /><span /><span /></div>
            <div className="result-label">Nearby with stock</div>
            <div className="r-row" role="button" tabIndex={0} onClick={() => setShowChatbot(true)} onKeyDown={(e) => e.key === 'Enter' && setShowChatbot(true)}>
              <span className="r-ico">🏥</span>
              <div><div className="r-name">Clicks Pharmacy</div><div className="r-dist">0.4 km · CBD</div></div>
              <span className="r-stock">In Stock</span>
            </div>
            <div className="r-row" role="button" tabIndex={0} onClick={() => setShowChatbot(true)} onKeyDown={(e) => e.key === 'Enter' && setShowChatbot(true)}>
              <span className="r-ico">💊</span>
              <div><div className="r-name">Patel Pharmacy</div><div className="r-dist">1.1 km · Avondale</div></div>
              <span className="r-stock">In Stock</span>
            </div>
            <div className="r-row" role="button" tabIndex={0} onClick={() => setShowChatbot(true)} onKeyDown={(e) => e.key === 'Enter' && setShowChatbot(true)}>
              <span className="r-ico">🩺</span>
              <div><div className="r-name">OK Pharmacy</div><div className="r-dist">2.3 km · Eastlea</div></div>
              <span className="r-stock">In Stock</span>
            </div>
          </div>
        </div>

        <div className="hero-curves">
          <svg viewBox="0 0 1440 130" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0,65 C200,130 400,10 600,65 C800,120 1000,5 1200,55 C1320,80 1400,40 1440,55 L1440,130 L0,130 Z" fill="rgba(240,250,251,0.5)" />
            <path d="M0,90 C300,20 500,130 800,70 C1000,30 1250,110 1440,65 L1440,130 L0,130 Z" fill="#F0FAFB" />
          </svg>
        </div>
      </section>

      <section className="how-section" id="how">
        <span className="eyebrow">Simple Process</span>
        <div className="sec-h">Three steps to <em>your medicine</em></div>
        <p className="sec-p">No more calling pharmacy after pharmacy. MediConnect finds your medicine for you, instantly.</p>
        <div className="steps">
          <div className="step">
            <div className="step-ghost">01</div>
            <div className="step-ico">🔍</div>
            <h3>Search</h3>
            <p>Type any medicine name or describe your symptoms — our AI matches it in seconds.</p>
          </div>
          <div className="step">
            <div className="step-ghost">02</div>
            <div className="step-ico">📍</div>
            <h3>Locate</h3>
            <p>See pharmacies near you on an interactive map with live stock and opening hours.</p>
          </div>
          <div className="step">
            <div className="step-ghost">03</div>
            <div className="step-ico">✅</div>
            <h3>Reserve</h3>
            <p>Reserve your medicine online or get turn-by-turn directions to the pharmacy.</p>
          </div>
          <div className="step">
            <div className="step-ghost">04</div>
            <div className="step-ico">🤖</div>
            <h3>Ask AI</h3>
            <p>Chat with MediBot for dosage info, drug interactions, and health guidance 24/7.</p>
          </div>
        </div>
      </section>

      <div className="curve-down">
        <svg viewBox="0 0 1440 90" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0,0 C360,90 720,0 1080,70 C1260,105 1380,30 1440,50 L1440,0 Z" fill="#F0FAFB" />
        </svg>
      </div>

      <section className="feat-section" id="features">
        <span className="eyebrow" style={{ color: 'var(--teal-lt)' }}>Why MediConnect</span>
        <div className="sec-h">Built for <em>Zimbabwe's</em> healthcare reality</div>
        <p className="sec-p">Designed with local patients, pharmacists, and healthcare workers in mind.</p>
        <div className="feats">
          <div className="feat">
            <div className="feat-ico">🤖</div>
            <h4>AI Medicine Assistant</h4>
            <p>Conversational AI that explains medicines, checks dosages, and suggests alternatives in plain language.</p>
          </div>
          <div className="feat">
            <div className="feat-ico">📡</div>
            <h4>Real-Time Stock</h4>
            <p>Pharmacies update inventory live — no more wasted trips to pharmacies with empty shelves.</p>
          </div>
          <div className="feat">
            <div className="feat-ico">🗺️</div>
            <h4>Interactive Map</h4>
            <p>Visual map of every nearby pharmacy with stock levels, ratings, and opening hours.</p>
          </div>
          <div className="feat">
            <div className="feat-ico">🔐</div>
            <h4>Secure Patient Portal</h4>
            <p>Save your prescription history, set medicine reminders, and manage your health profile.</p>
          </div>
          <div className="feat">
            <div className="feat-ico">🏪</div>
            <h4>Pharmacy Dashboard</h4>
            <p>Dedicated pharmacist portal for inventory management, reservations, and analytics.</p>
          </div>
          <div className="feat">
            <div className="feat-ico">📱</div>
            <h4>Works Everywhere</h4>
            <p>Fully responsive — seamless experience on any phone, tablet, or desktop.</p>
          </div>
        </div>
      </section>

      <div className="curve-up">
        <svg viewBox="0 0 1440 90" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0,90 C360,0 720,90 1080,20 C1260,-20 1380,70 1440,45 L1440,90 Z" fill="#F0FAFB" />
        </svg>
      </div>

      <div className="cta-outer" id="pharmacies">
        <div className="cta-card">
          <div className="cta-text">
            <h2>Ready to find your medicine <em>faster</em>?</h2>
            <p>Free for patients, always. Join thousands of Zimbabweans already using MediConnect.</p>
          </div>
          <div className="cta-btns">
            <Link to="/patient/dashboard" className="btn-w">Start Searching Free</Link>
            <Link to="/register" className="btn-o">Register Your Pharmacy</Link>
          </div>
        </div>
      </div>

      <footer id="about">
        <div className="foot-logo">Medi<span>Connect</span></div>
        <p>© 2025 MediConnect Zimbabwe — Capstone Project</p>
        <div className="foot-links">
          <a href="#/">Privacy</a>
          <a href="#/">Terms</a>
          <a href="#/">About</a>
          <a href="#/">Contact</a>
        </div>
      </footer>

      <button type="button" className="lp-chatbot-float" onClick={() => setShowChatbot(true)} title="Chat with MediBot">
        <MessageSquare size={24} />
        <span className="lp-chatbot-pulse" />
      </button>

      <Chatbot key={initialQuery || 'chat'} isOpen={showChatbot} onClose={() => setShowChatbot(false)} initialQuery={initialQuery} initialMode="direct" />
    </div>
  )
}

export default LandingPage
