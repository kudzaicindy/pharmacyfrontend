import { useState } from 'react'
import Chatbot from '../components/Chatbot'
import '../components/PatientLayout.css'

export default function PatientAssistant() {
  const [open, setOpen] = useState(true)
  return (
    <>
      <div className="topbar">
        <div><h1>AI Assistant</h1><p>Chat with MediBot</p></div>
      </div>
      <Chatbot isOpen={open} onClose={() => setOpen(false)} />
      {!open && <button type="button" className="btn btn-teal" onClick={() => setOpen(true)}>Open MediBot</button>}
    </>
  )
}
