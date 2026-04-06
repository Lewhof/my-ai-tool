'use client';
import { useState } from 'react';
import { UserButton } from '@clerk/nextjs';

export default function Dashboard() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState('Dashboard');

  async function sendMessage() {
    if (!message.trim()) return;
    setLoading(true);
    setResponse('');
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
    const data = await res.json();
    setResponse(data.reply);
    setLoading(false);
  }

  const nav = ['Dashboard', 'Chat', 'Documents', 'Settings'];

  return (
    <div className="flex h-screen bg-gray-950">
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-5 border-b border-gray-800">
          <p className="text-white font-semibold text-lg">Lewhof AI</p>
        </div>
        <nav className="flex-1 p-3">
          {nav.map(item => (
            <button key={item} onClick={() => setActive(item)}
              className={`w-full text-left px-4 py-2.5 rounded-lg mb-1 text-sm transition ${active === item ? 'bg-purple-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              {item}
            </button>
          ))}
        </nav>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6">
          <p className="text-white font-medium">{active}</p>
          <UserButton afterSignOutUrl="/sign-in" />
        </header>
        <main className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[['Total Revenue','$45,231'],['Active Users','2,345'],['New Orders','189'],['Conversion','3.24%']].map(([label, val]) => (
              <div key={label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <p className="text-gray-400 text-xs mb-1">{label}</p>
                <p className="text-white text-2xl font-semibold">{val}</p>
              </div>
            ))}
          </div>
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <p className="text-white font-medium mb-4">Claude AI</p>
            <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none mb-3"
              placeholder="Ask something..." value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()} />
            <div className="min-h-24 bg-gray-800 rounded-lg p-4 text-sm text-gray-300 mb-3">
              {loading ? 'Thinking...' : response || 'Response will appear here.'}
            </div>
            <button onClick={sendMessage} className="bg-white text-gray-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">
              {loading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
