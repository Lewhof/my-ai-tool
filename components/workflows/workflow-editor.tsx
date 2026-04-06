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
        <div key={i} className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-sm font-mono">#{i + 1}</span>
            <input
              value={step.name}
              onChange={(e) => updateStep(i, { name: e.target.value })}
              className="flex-1 bg-gray-700 text-white border border-gray-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent-600"
              placeholder="Step name"
            />
            <select
              value={step.model}
              onChange={(e) => updateStep(i, { model: e.target.value as 'fast' | 'smart' })}
              className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1.5 text-sm"
            >
              <option value="fast">Haiku (fast)</option>
              <option value="smart">Sonnet (smart)</option>
            </select>
            <button onClick={() => moveStep(i, -1)} className="text-gray-500 hover:text-white px-1" disabled={i === 0}>^</button>
            <button onClick={() => moveStep(i, 1)} className="text-gray-500 hover:text-white px-1" disabled={i === steps.length - 1}>v</button>
            <button onClick={() => removeStep(i)} className="text-gray-500 hover:text-red-400 px-1">x</button>
          </div>
          <textarea
            value={step.prompt}
            onChange={(e) => updateStep(i, { prompt: e.target.value })}
            rows={3}
            className="w-full bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent-600 resize-none"
            placeholder="Prompt template. Use {{input}} for original input, {{previous}} for last step's output."
          />
        </div>
      ))}
      <button
        onClick={addStep}
        className="w-full border-2 border-dashed border-gray-600 rounded-lg py-3 text-gray-400 hover:border-gray-500 hover:text-gray-300 transition-colors"
      >
        + Add Step
      </button>
    </div>
  );
}
