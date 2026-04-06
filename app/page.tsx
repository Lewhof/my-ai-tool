'use client';

import { UserButton } from '@clerk/nextjs';
import { useState } from 'react';

export default function Dashboard() {
  const [active, setActive] = useState('Dashboard');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

  const navItems = [
    { name: 'Dashboard', icon: '📊' },
    { name: 'Chat', icon: '💬' },
    { name: 'Documents', icon: '📄' },
    { name: 'Settings', icon: '⚙️' },
  ];

  const stats = [
    { label: 'Revenue', value: '$45,231', change: '+20.1%', positive: true },
    { label: 'Users', value: '2,345', change: '+15.3%', positive: true },
    { label: 'Orders', value: '1,234', change: '-4.2%', positive: false },
    { label: 'Conversion Rate', value: '3.2%', change: '+2.4%', positive: true },
  ];

  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isLoading) return;

    const userMsg = chatInput;
    setChatMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setChatInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();
      setChatMessages((prev) => [...prev, { role: 'assistant', content: data.reply ?? 'No response.' }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="h-14 flex items-center justify-center border-b border-gray-700">
          <h1 className="text-xl font-bold text-white">AI Dashboard</h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.name}
              onClick={() => setActive(item.name)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                active === item.name
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="font-medium">{item.name}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6">
          <p className="text-white font-medium">{active}</p>
          <UserButton />
        </header>
        <main className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-4 gap-4 mb-6">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-gray-800 border border-gray-700 rounded-lg p-5">
                <p className="text-gray-400 text-sm mb-1">{stat.label}</p>
                <p className="text-white text-2xl font-bold mb-2">{stat.value}</p>
                <p className={`text-sm font-medium ${stat.positive ? 'text-green-400' : 'text-red-400'}`}>
                  {stat.change}
                </p>
              </div>
            ))}
          </div>

          {/* Claude AI Chat Widget */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-900 border-b border-gray-700 px-5 py-3">
              <h2 className="text-white font-semibold">Claude AI Assistant</h2>
            </div>
            <div className="h-96 overflow-auto p-5 space-y-4">
              {chatMessages.length === 0 ? (
                <p className="text-gray-500 text-center py-12">Start a conversation with Claude AI</p>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xl px-4 py-2 rounded-lg ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-100'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-gray-700 p-4 flex gap-3">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask Claude anything..."
                className="flex-1 bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                onClick={handleSendMessage}
                disabled={isLoading}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Thinking...' : 'Send'}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}