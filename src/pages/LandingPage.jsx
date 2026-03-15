import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  Stethoscope, 
  Search, 
  Upload, 
  MessageSquare, 
  MapPin, 
  Shield, 
  Zap,
  CheckCircle,
  ArrowRight,
  Pill,
  Heart,
  Activity,
  Cross,
  Building2,
  Clock,
  Award,
  HeartPulse,
  Camera,
  Mic,
  DollarSign,
  Phone,
  Bell,
  TrendingUp
} from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import Chatbot from '../components/Chatbot'
import './LandingPage.css'

function LandingPage() {
  const { language, setLanguage, languages, t } = useLanguage()
  const [searchQuery, setSearchQuery] = useState('')
  const [showChatbot, setShowChatbot] = useState(false)
  const [searchType, setSearchType] = useState('direct') // 'direct', 'symptom', 'prescription'

  const handleSearch = () => {
    if (searchQuery.trim()) {
      setShowChatbot(true)
    }
  }

  const handleSymptomSearch = () => {
    setSearchType('symptom')
    setShowChatbot(true)
  }

  const handlePrescriptionUpload = (event) => {
    const file = event.target.files[0]
    if (file) {
      setSearchType('prescription')
      setShowChatbot(true)
    }
  }

  useEffect(() => {
    const handleScroll = () => {
      const navbar = document.querySelector('.navbar')
      if (navbar) {
        if (window.scrollY > 50) {
          navbar.classList.add('scrolled')
        } else {
          navbar.classList.remove('scrolled')
        }
      }
    }

    // Check initial scroll position
    handleScroll()
    
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="landing-page">
      {/* Navigation */}
      <nav className="navbar" id="navbar">
        <div className="nav-container">
          <div className="logo">
            <div className="logo-medical">
              <Cross className="cross-icon" />
            </div>
            <span className="logo-text">Medi<span className="logo-accent">Connect</span></span>
          </div>
          <div className="nav-links">
            <div className="nav-lang">
              <label className="nav-lang-label" htmlFor="nav-language-select">
                {t('Language')}:
              </label>
              <select
                id="nav-language-select"
                className="nav-lang-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label={t('Language')}
              >
                {Object.entries(languages).map(([code, { name, flag }]) => (
                  <option key={code} value={code}>
                    {flag} {name}
                  </option>
                ))}
              </select>
            </div>
            <Link to="/" className="nav-link">Home</Link>
            <Link to="/patient/dashboard" className="nav-link">How it works</Link>
            <Link to="/register" className="nav-link">For Pharmacies</Link>
            <Link to="/login" className="nav-link">Login</Link>
            <div className="nav-phone">
              <Phone className="phone-icon" />
              <span>+263 77 123 4567</span>
            </div>
            <Link to="/register" className="nav-link primary">Appointment</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-background-image"></div>
        <div className="hero-overlay"></div>
        <div className="hero-container">
          <div className="hero-content">
            <div className="hero-greeting">Welcome to MediConnect</div>
            <h1 className="hero-title">
              Smart Healthcare for <span className="highlight-green">Healthier Future</span>
            </h1>
            <p className="hero-subtitle">
              Connect with licensed pharmacies instantly. Find prescription medicines, compare prices, 
              and get your medications delivered quickly with our intelligent platform.
            </p>
            
            <div className="hero-buttons">
              <button 
                onClick={() => setShowChatbot(true)}
                className="btn btn-primary"
              >
                {t('Find Medicine')} <Search className="btn-icon" />
              </button>
              <Link to="/patient/dashboard" className="btn btn-secondary">
                Make Appointment <ArrowRight className="btn-icon" />
              </Link>
            </div>
          </div>
        </div>
        
        {/* Pagination Dots */}
        <div className="hero-pagination">
          <span className="pagination-dot active"></span>
          <span className="pagination-dot"></span>
        </div>
        
        <div className="hero-wave"></div>
      </section>

      {/* About Section */}
      <section className="about-section">
        <div className="container">
          <div className="about-content">
            <div className="about-images">
              <div className="image-grid">
                <div className="grid-item">
                  <img 
                    src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400&h=400&fit=crop&q=90" 
                    alt="Medical professionals"
                  />
                </div>
                <div className="grid-item">
                  <img 
                    src="https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400&h=400&fit=crop&q=90" 
                    alt="Medical consultation"
                  />
                </div>
                <div className="grid-item testimonial-bubble">
                  <div className="testimonial-content">
                    <p className="testimonial-text">"Great Health Starts with Smart Choices"</p>
                    <p className="testimonial-author">Admin One</p>
                  </div>
                </div>
                <div className="grid-item">
                  <img 
                    src="https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&h=400&fit=crop&q=90" 
                    alt="Doctor"
                  />
                </div>
              </div>
            </div>
            <div className="about-text">
              <div className="section-label">About Us</div>
              <h2 className="section-title-large">Bringing Quality Care Closer to You</h2>
              <p className="section-description">
                HealthConnect revolutionizes how patients find and access medicines. Our intelligent 
                platform connects you with verified pharmacies, ensuring you get the right medications 
                at the best prices, delivered quickly and safely.
              </p>
              <div className="about-features">
                <div className="about-feature">
                  <CheckCircle className="feature-check-icon" />
                  <span>100+ Licensed Pharmacies</span>
                </div>
                <div className="about-feature">
                  <CheckCircle className="feature-check-icon" />
                  <span>AI-Powered Search</span>
                </div>
                <div className="about-feature">
                  <CheckCircle className="feature-check-icon" />
                  <span>Fast Delivery Available</span>
                </div>
                <div className="about-feature">
                  <CheckCircle className="feature-check-icon" />
                  <span>Secure & Private</span>
                </div>
              </div>
              <Link to="/patient/dashboard" className="btn btn-primary">
                Learn More <ArrowRight className="btn-icon" />
              </Link>
            </div>
          </div>
        </div>
      </section>



      {/* How It Works */}
      <section className="how-it-works">
        <div className="container">
          <div className="how-it-works-header">
            <div className="section-label">How it works</div>
            <h2 className="how-it-works-title">Three simple steps to find your medicine</h2>
            <p className="how-it-works-subtitle">
              Our intelligent platform makes finding and comparing medicines effortless
            </p>
          </div>
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">01</div>
              <div className="step-icon-box">
                <Search className="step-icon" />
              </div>
              <h3 className="step-title">Search</h3>
              <p className="step-description">
                Upload your prescription, describe your symptoms to our AI assistant, 
                or search directly by medicine name. Multiple ways to find what you need.
              </p>
            </div>
            
            <div className="step-card">
              <div className="step-number">02</div>
              <div className="step-icon-box">
                <MapPin className="step-icon" />
              </div>
              <h3 className="step-title">Compare</h3>
              <p className="step-description">
                Our AI instantly notifies nearby licensed pharmacies and collects 
                real-time pricing, availability, and distance information.
              </p>
            </div>
            
            <div className="step-card">
              <div className="step-number">03</div>
              <div className="step-icon-box">
                <CheckCircle className="step-icon" />
              </div>
              <h3 className="step-title">Choose</h3>
              <p className="step-description">
                View ranked results by price, distance, and pharmacy ratings. 
                Select the best option and get your medicine delivered or pick it up.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="benefits">
        <div className="container">
          <div className="benefits-header">
            <div className="section-label">Why choose HealthConnect?</div>
            <h2 className="benefits-title">Save time, money, and effort finding your medicine</h2>
            <p className="benefits-subtitle">
              Experience the future of healthcare with our intelligent platform designed 
              to make medicine access simple, fast, and affordable.
            </p>
          </div>
          <div className="benefits-content">
            <div className="benefits-text">
              <div className="benefit-list">
                <div className="benefit-item-new">
                  <div className="benefit-icon-circle">
                    <Clock className="benefit-icon" />
                  </div>
                  <div className="benefit-text">
                    <h3 className="benefit-title">Get results in 2 seconds</h3>
                    <p className="benefit-desc">
                      No more calling multiple pharmacies or driving around town. 
                      Our AI-powered search finds what you need instantly.
                    </p>
                  </div>
                </div>
                
                <div className="benefit-item-new">
                  <div className="benefit-icon-circle">
                    <DollarSign className="benefit-icon" />
                  </div>
                  <div className="benefit-text">
                    <h3 className="benefit-title">Compare prices instantly</h3>
                    <p className="benefit-desc">
                      Save up to 40% by finding the best deal near you. 
                      Compare prices across multiple pharmacies in real-time.
                    </p>
                  </div>
                </div>
                
                <div className="benefit-item-new">
                  <div className="benefit-icon-circle">
                    <MapPin className="benefit-icon" />
                  </div>
                  <div className="benefit-text">
                    <h3 className="benefit-title">Find nearby pharmacies</h3>
                    <p className="benefit-desc">
                      See distance, travel time, and directions to each pharmacy. 
                      Choose the most convenient location for you.
                    </p>
                  </div>
                </div>
                
                <div className="benefit-item-new">
                  <div className="benefit-icon-circle">
                    <Award className="benefit-icon" />
                  </div>
                  <div className="benefit-text">
                    <h3 className="benefit-title">Verified pharmacies only</h3>
                    <p className="benefit-desc">
                      All pharmacies are licensed and rated by real patients. 
                      Your health and safety are our top priority.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="benefits-visual">
              <div className="capsules-image">
                <img 
                  src="https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&h=800&fit=crop&q=90" 
                  alt="Medicine capsules"
                />
                <div className="patients-badge">
                  <CheckCircle className="badge-check" />
                  <div className="badge-content">
                    <div className="badge-number">10,000+</div>
                    <div className="badge-text">Patients helped</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* For Pharmacies Section */}
      <section className="for-pharmacies">
        <div className="container">
          <div className="pharmacies-header">
            <div className="section-label">For Pharmacies</div>
            <h2 className="pharmacies-title">Join HealthConnect and Grow Your Pharmacy Business</h2>
            <p className="pharmacies-subtitle">
              Connect with patients in your area, respond to medicine requests, and increase your visibility. 
              It's free to register and takes just a few minutes.
            </p>
          </div>

          <div className="pharmacies-content">
            <div className="pharmacies-benefits">
              <div className="pharmacy-benefit-card">
                <div className="pharmacy-benefit-icon">
                  <Bell className="icon" />
                </div>
                <h3>Receive Medicine Requests</h3>
                <p>Get notified when patients in your area need medicines. Respond quickly to increase your chances of making a sale.</p>
              </div>

              <div className="pharmacy-benefit-card">
                <div className="pharmacy-benefit-icon">
                  <TrendingUp className="icon" />
                </div>
                <h3>Increase Visibility</h3>
                <p>Be discovered by patients searching for medicines. Appear in search results based on location, availability, and pricing.</p>
              </div>

              <div className="pharmacy-benefit-card">
                <div className="pharmacy-benefit-icon">
                  <Clock className="icon" />
                </div>
                <h3>Quick Response System</h3>
                <p>Use our dashboard to quickly respond to requests with availability, pricing, and preparation time. Save time and serve more customers.</p>
              </div>

              <div className="pharmacy-benefit-card">
                <div className="pharmacy-benefit-icon">
                  <DollarSign className="icon" />
                </div>
                <h3>Grow Your Revenue</h3>
                <p>Connect with more patients and increase sales. Our platform helps you reach customers who might not have found you otherwise.</p>
              </div>
            </div>

            <div className="pharmacies-registration">
              <div className="registration-box">
                <h3>How to Get Started</h3>
                <div className="registration-steps">
                  <div className="registration-step">
                    <div className="step-number-circle">1</div>
                    <div className="step-content">
                      <h4>Register Your Pharmacy</h4>
                      <p>Create your pharmacy profile with name, address, and contact information. This takes about 2 minutes.</p>
                    </div>
                  </div>

                  <div className="registration-step">
                    <div className="step-number-circle">2</div>
                    <div className="step-content">
                      <h4>Add Pharmacists</h4>
                      <p>Register yourself and your team members as pharmacists. Each pharmacist gets their own dashboard to manage requests.</p>
                    </div>
                  </div>

                  <div className="registration-step">
                    <div className="step-number-circle">3</div>
                    <div className="step-content">
                      <h4>Start Receiving Requests</h4>
                      <p>Once registered, you'll start receiving medicine requests from patients in your area. Respond quickly to win business!</p>
                    </div>
                  </div>
                </div>

                <div className="registration-cta">
                  <Link to="/register" className="btn btn-primary btn-large">
                    Register Your Pharmacy <ArrowRight className="btn-icon" />
                  </Link>
                  <p className="registration-note">
                    Already registered? <Link to="/login">Login to your dashboard</Link>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta">
        <div className="container">
          <h2 className="cta-title">Ready to find your medicine?</h2>
          <p className="cta-description">Join thousands of patients connecting with licensed pharmacies across Zimbabwe</p>
          <div className="cta-buttons">
            <Link to="/patient/dashboard" className="btn btn-primary btn-large">
              Get Started <ArrowRight className="btn-icon" />
            </Link>
            <Link to="/register" className="btn btn-secondary btn-large">
              For Pharmacies
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-section">
              <div className="footer-logo">
                <Stethoscope className="logo-icon" />
                <span>HealthConnect</span>
              </div>
              <p>Intelligent Healthcare Connection Platform</p>
            </div>
            <div className="footer-section">
              <h4>For Patients</h4>
              <Link to="/register">Get Started</Link>
              <Link to="/login">Login</Link>
            </div>
            <div className="footer-section">
              <h4>For Pharmacies</h4>
              <Link to="/login">Pharmacy Login</Link>
              <Link to="/register">Register Pharmacy</Link>
            </div>
            <div className="footer-section">
              <h4>About</h4>
              <p>Capstone Project</p>
              <p>Computer Science Department</p>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2025 HealthConnect. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Floating Chatbot Button */}
      <button 
        className="chatbot-float-button"
        onClick={() => setShowChatbot(true)}
        title="Chat with AI Assistant"
      >
        <MessageSquare className="chatbot-float-icon" />
        <span className="chatbot-float-pulse"></span>
      </button>

      {/* Chatbot */}
      <Chatbot 
        isOpen={showChatbot} 
        onClose={() => setShowChatbot(false)}
        initialQuery={searchQuery}
      />
    </div>
  )
}

export default LandingPage


