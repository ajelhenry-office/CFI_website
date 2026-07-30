import React, { useState, useRef, useEffect } from 'react';
import { C, FONT } from '../../theme';

export default function ChatbotWidget({ userRole }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', text: `Hi there! I'm your Curefoods AI Assistant. (You are logged in as: ${userRole}).\n\nI'm currently in visual mock-up mode, but soon I'll be able to analyze your dashboard data. What would you like to know?` }
  ]);
  const [inputValue, setInputValue] = useState("");
  const endOfMessagesRef = useRef(null);

  useEffect(() => {
    if (endOfMessagesRef.current) {
      endOfMessagesRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    
    // Add user message
    setMessages(prev => [...prev, { role: 'user', text: inputValue }]);
    setInputValue("");
    
    // Mock AI response
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        text: "I am just a visual interface right now! My actual AI brain is still being connected. 🧠" 
      }]);
    }, 1000);
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: '50%',
          backgroundColor: C.primary,
          color: '#fff',
          border: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isOpen ? 'scale(0.8)' : 'scale(1)'
        }}
        aria-label="Toggle AI Chat"
      >
        {isOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            <path d="M12 7v5l3 2"></path>
          </svg>
        )}
      </button>

      {/* Chat Window Panel */}
      <div 
        style={{
          position: 'fixed',
          bottom: 96,
          right: 24,
          width: 360,
          height: 520,
          backgroundColor: '#ffffff',
          borderRadius: 16,
          boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 9998,
          overflow: 'hidden',
          fontFamily: FONT,
          transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          transform: isOpen ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.9)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none'
        }}
      >
        {/* Header */}
        <div style={{ backgroundColor: C.primary, color: '#fff', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: -0.3 }}>KitchenPulse AI</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Data Analyst</div>
          </div>
        </div>

        {/* Message Thread */}
        <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, backgroundColor: '#f8fafc' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div 
                style={{ 
                  maxWidth: '85%',
                  padding: '12px 14px',
                  borderRadius: 12,
                  fontSize: 13,
                  lineHeight: 1.5,
                  fontWeight: 500,
                  color: m.role === 'user' ? '#fff' : C.text,
                  backgroundColor: m.role === 'user' ? C.primary : '#fff',
                  border: m.role === 'user' ? 'none' : `1px solid ${C.borderSoft}`,
                  boxShadow: m.role === 'user' ? 'none' : '0 2px 4px rgba(0,0,0,0.02)',
                  borderBottomRightRadius: m.role === 'user' ? 2 : 12,
                  borderBottomLeftRadius: m.role === 'user' ? 12 : 2,
                  whiteSpace: 'pre-wrap'
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
          <div ref={endOfMessagesRef} />
        </div>

        {/* Input Area */}
        <form onSubmit={handleSend} style={{ padding: 12, borderTop: `1px solid ${C.borderSoft}`, backgroundColor: '#fff', display: 'flex', gap: 8 }}>
          <input 
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask for an insight..."
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 20,
              border: `1.5px solid ${C.borderSoft}`,
              outline: 'none',
              fontFamily: FONT,
              fontSize: 13,
              backgroundColor: '#f8fafc'
            }}
          />
          <button 
            type="submit"
            style={{
              width: 40, height: 40, borderRadius: '50%', backgroundColor: inputValue.trim() ? C.primary : C.muted, color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: inputValue.trim() ? 'pointer' : 'not-allowed', transition: 'background-color 0.2s'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </form>
      </div>
    </>
  );
}
