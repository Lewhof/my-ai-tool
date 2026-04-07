'use client';

import { useState, useRef } from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !disabled) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  return (
    <div className="border-t border-gray-700 p-3 sm:p-4 flex gap-3 shrink-0">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Type a message... (Shift+Enter for newline)"
        rows={1}
        className="flex-1 bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-600 resize-none placeholder-gray-500"
        disabled={disabled}
      />
      <button
        onClick={handleSend}
        disabled={disabled || !input.trim()}
        className="bg-accent-600 text-white p-2.5 rounded-lg hover:bg-accent-700 transition-colors disabled:opacity-30 self-end"
        title="Send message"
      >
        <Send size={18} />
      </button>
    </div>
  );
}
