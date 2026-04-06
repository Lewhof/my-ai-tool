'use client';

import { useState, useEffect, useCallback, use } from 'react';
import WorkflowEditor from '@/components/workflows/workflow-editor';
import WorkflowRunner from '@/components/workflows/workflow-runner';
import type { Workflow, WorkflowStep } from '@/lib/types';

export default function WorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'run'>('editor');

  const fetchWorkflow = useCallback(async () => {
    const res = await fetch(`/api/workflows/${id}`);
    const data = await res.json();
    if (data.workflow) {
      setWorkflow(data.workflow);
      setName(data.workflow.name);
      setDescription(data.workflow.description || '');
      setSteps(data.workflow.steps || []);
    }
  }, [id]);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  const save = async () => {
    setSaving(true);
    await fetch(`/api/workflows/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, steps }),
    });
    setSaving(false);
  };

  if (!workflow) return <div className="p-6 text-gray-400">Loading...</div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="text-2xl font-bold bg-transparent text-white border-none outline-none w-full"
          placeholder="Workflow name"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="text-gray-400 bg-transparent border-none outline-none w-full"
          placeholder="Description (optional)"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('editor')}
          className={`pb-2 px-1 text-sm font-medium transition-colors ${
            activeTab === 'editor' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Editor
        </button>
        <button
          onClick={() => setActiveTab('run')}
          className={`pb-2 px-1 text-sm font-medium transition-colors ${
            activeTab === 'run' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Run
        </button>
      </div>

      {activeTab === 'editor' ? (
        <div className="space-y-4">
          <WorkflowEditor steps={steps} onChange={setSteps} />
          <button
            onClick={save}
            disabled={saving}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Workflow'}
          </button>
        </div>
      ) : (
        <WorkflowRunner workflowId={id} />
      )}
    </div>
  );
}
