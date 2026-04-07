'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface WorkflowRunnerProps {
  workflowId: string;
}

interface StepOutput {
  name: string;
  content: string;
  done: boolean;
}

export default function WorkflowRunner({ workflowId }: WorkflowRunnerProps) {
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [stepOutputs, setStepOutputs] = useState<StepOutput[]>([]);

  const runWorkflow = async () => {
    if (!input.trim() || running) return;
    setRunning(true);
    setStepOutputs([]);

    try {
      const res = await fetch(`/api/workflows/${workflowId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);

          if (event.type === 'step_start') {
            setStepOutputs((prev) => [...prev, { name: event.name, content: '', done: false }]);
          } else if (event.type === 'text_delta') {
            setStepOutputs((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last) last.content += event.text;
              return updated;
            });
          } else if (event.type === 'step_end') {
            setStepOutputs((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last) last.done = true;
              return updated;
            });
          }
        }
      }
    } catch (err) {
      setStepOutputs((prev) => [
        ...prev,
        { name: 'Error', content: err instanceof Error ? err.message : 'Unknown error', done: true },
      ]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          placeholder="Enter your input here..."
          className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
        <button
          onClick={runWorkflow}
          disabled={running || !input.trim()}
          className="mt-2 bg-primary text-foreground px-6 py-2 rounded-lg font-medium hover:bg-primary transition-colors disabled:opacity-50"
        >
          {running ? 'Running...' : 'Run Workflow'}
        </button>
      </div>

      {stepOutputs.length > 0 && (
        <div className="space-y-3">
          {stepOutputs.map((step, i) => (
            <div key={i} className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-2 border-b border-border flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${step.done ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`} />
                <span className="text-foreground text-sm font-medium">{step.name}</span>
              </div>
              <div className="p-4 prose prose-invert prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{step.content || '...'}</ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
