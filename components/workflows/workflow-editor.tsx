'use client';

import type { WorkflowStep } from '@/lib/types';

interface WorkflowEditorProps {
  steps: WorkflowStep[];
  onChange: (steps: WorkflowStep[]) => void;
}

export default function WorkflowEditor({ steps, onChange }: WorkflowEditorProps) {
  const updateStep = (index: number, updates: Partial<WorkflowStep>) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], ...updates };
    onChange(newSteps);
  };

  const removeStep = (index: number) => {
    onChange(steps.filter((_, i) => i !== index));
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= steps.length) return;
    const newSteps = [...steps];
    [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
    onChange(newSteps);
  };

  const addStep = () => {
    onChange([...steps, { name: `Step ${steps.length + 1}`, prompt: '', model: 'fast' }]);
  };

  return (
    <div className="space-y-4">
      {steps.map((step, i) => (
        <div key={i} className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm font-mono">#{i + 1}</span>
            <input
              value={step.name}
              onChange={(e) => updateStep(i, { name: e.target.value })}
              className="flex-1 bg-secondary text-foreground border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Step name"
            />
            <select
              value={step.model}
              onChange={(e) => updateStep(i, { model: e.target.value as 'fast' | 'smart' })}
              className="bg-secondary text-foreground border border-border rounded px-2 py-1.5 text-sm"
            >
              <option value="fast">Haiku (fast)</option>
              <option value="smart">Sonnet (smart)</option>
            </select>
            <button onClick={() => moveStep(i, -1)} className="text-muted-foreground hover:text-foreground px-1" disabled={i === 0}>^</button>
            <button onClick={() => moveStep(i, 1)} className="text-muted-foreground hover:text-foreground px-1" disabled={i === steps.length - 1}>v</button>
            <button onClick={() => removeStep(i)} className="text-muted-foreground hover:text-red-400 px-1">x</button>
          </div>
          <textarea
            value={step.prompt}
            onChange={(e) => updateStep(i, { prompt: e.target.value })}
            rows={3}
            className="w-full bg-secondary text-foreground border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            placeholder="Prompt template. Use {{input}} for original input, {{previous}} for last step's output."
          />
        </div>
      ))}
      <button
        onClick={addStep}
        className="w-full border-2 border-dashed border-border rounded-lg py-3 text-muted-foreground hover:border-white/15 hover:text-foreground transition-colors"
      >
        + Add Step
      </button>
    </div>
  );
}
