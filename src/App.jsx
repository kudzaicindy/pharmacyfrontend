import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import Login from './pages/Login'
import Register from './pages/Register'
import PatientLayout from './components/PatientLayout'
import PatientDashboard from './pages/PatientDashboard'
import PatientSearch from './pages/PatientSearch'
import PatientRequests from './pages/PatientRequests'
import PatientHistory from './pages/PatientHistory'
import PatientSaved from './pages/PatientSaved'
import PatientAssistant from './pages/PatientAssistant'
import PatientNotifications from './pages/PatientNotifications'
import PatientProfile from './pages/PatientProfile'
import PatientSettings from './pages/PatientSettings'
import PharmacyDashboard from './pages/PharmacyDashboard'
import AdminDashboard from './pages/AdminDashboard'
import './App.css'

function App() {
  // Allow direct access to dashboards for now
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/patient" element={<PatientLayout />}>
          <Route index element={<Navigate to="/patient/dashboard" replace />} />
          <Route path="dashboard" element={<PatientDashboard />} />
          <Route path="search" element={<PatientSearch />} />
          <Route path="requests" element={<PatientRequests />} />
          <Route path="history" element={<PatientHistory />} />
          <Route path="saved" element={<PatientSaved />} />
          <Route path="ai-assistant" element={<PatientAssistant />} />
          <Route path="notifications" element={<PatientNotifications />} />
          <Route path="profile" element={<PatientProfile />} />
          <Route path="settings" element={<PatientSettings />} />
        </Route>

        <Route path="/pharmacy/dashboard" element={<PharmacyDashboard />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  )
}

export default App
