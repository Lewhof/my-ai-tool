'use client';

import { useState } from 'react';
import { Sparkles, Download, Image as ImageIcon, Loader2 } from 'lucide-react';

export default function ImageLabPage() {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ text: string; image: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ prompt: string; image: string; text: string }>>([]);

  const generate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Generation failed');
        return;
      }

      setResult(data);
      if (data.image) {
        setHistory((prev) => [{ prompt, image: data.image, text: data.text || '' }, ...prev].slice(0, 20));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setGenerating(false);
    }
  };

  const downloadImage = (dataUrl: string, name: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${name}.png`;
    a.click();
  };

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Image Lab</h2>
        <p className="text-gray-500 text-sm mt-1">Generate images with Google Gemini (Nano Banana)</p>
      </div>

      {/* Prompt input */}
      <div className="flex gap-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generate(); } }}
          placeholder="Describe the image you want to generate..."
          rows={2}
          className="flex-1 bg-gray-800 text-white border border-gray-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-600 resize-none placeholder-gray-500"
          disabled={generating}
        />
        <button
          onClick={generate}
          disabled={generating || !prompt.trim()}
          className="bg-accent-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-accent-700 transition-colors disabled:opacity-50 flex items-center gap-2 self-end shrink-0"
        >
          {generating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          {generating ? 'Generating...' : 'Generate'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          {result.image ? (
            <div className="relative">
              <img src={result.image} alt={prompt} className="w-full max-h-[600px] object-contain bg-gray-900" />
              <button
                onClick={() => downloadImage(result.image!, prompt.slice(0, 30))}
                className="absolute top-3 right-3 bg-gray-900/80 text-white p-2 rounded-lg hover:bg-gray-900 transition-colors"
                title="Download"
              >
                <Download size={16} />
              </button>
            </div>
          ) : (
            <div className="p-8 text-center">
              <ImageIcon size={32} className="mx-auto text-gray-600 mb-2" />
              <p className="text-gray-500 text-sm">No image generated. Try a more descriptive prompt.</p>
            </div>
          )}
          {result.text && (
            <div className="px-5 py-3 border-t border-gray-700">
              <p className="text-gray-300 text-sm">{result.text}</p>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">Recent Generations</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {history.map((item, i) => (
              <div key={i} className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden group cursor-pointer" onClick={() => setResult({ text: item.text, image: item.image })}>
                <img src={item.image} alt={item.prompt} className="w-full h-32 object-cover" />
                <div className="px-3 py-2">
                  <p className="text-gray-400 text-xs truncate">{item.prompt}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
