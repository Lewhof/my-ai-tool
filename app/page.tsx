'use client';
import { useState } from 'react';
export default function Dashboard() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  async function sendMessage() {
    if (!message.trim()) return;
    setLoading(true);
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
    const data = await res.json();
    setResponse(data.reply);
    setLoading(false);
  }
  return (
    <main style={{minHeight:'100vh',background:'#030712',color:'white',padding:'24px'}}>
      <h1 style={{fontSize:'24px',fontWeight:600}}>Dashboard</h1>
      <p style={{color:'#9ca3af',marginTop:'4px'}}>Welcome back, Ryan.</p>
      <div style={{marginTop:'24px',background:'#111827',borderRadius:'12px',padding:'20px',border:'1px solid #1f2937'}}>
        <p style={{fontWeight:500,marginBottom:'12px'}}>Claude AI</p>
        <input style={{width:'100%',background:'#1f2937',border:'1px solid #374151',borderRadius:'8px',padding:'10px',color:'white',marginBottom:'12px'}} placeholder="Ask something..." value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendMessage()}/>
        <div style={{minHeight:'80px',background:'#1f2937',borderRadius:'8px',padding:'12px',color:'#d1d5db',marginBottom:'12px'}}>{loading?'Thinking...':response||'Response will appear here.'}</div>
        <button onClick={sendMessage} style={{background:'white',color:'black',padding:'8px 16px',borderRadius:'8px',border:'none',cursor:'pointer'}}>{loading?'Sending...':'Send'}</button>
      </div>
    </main>
  );
}
