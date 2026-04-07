'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { formatRelativeDate } from '@/lib/utils';
import { workflowTemplates } from '@/lib/workflow-templates';
import type { Workflow } from '@/lib/types';

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);

  const fetchWorkflows = useCallback(async () => {
    const res = await fetch('/api/workflows');
    const data = await res.json();
    setWorkflows(data.workflows ?? []);
  }, []);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const createWorkflow = async (name: string, description: string, steps: Workflow['steps']) => {
    const res = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, steps }),
    });
    const data = await res.json();
    if (data.id) router.push(`/workflows/${data.id}`);
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/workflows/${id}`, { method: 'DELETE' });
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
  };

  return (
    <div className="p-6 space-y-8">
      {/* My Workflows */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">My Workflows</h3>
          <button
            onClick={() => createWorkflow('New Workflow', '', [])}
            className="bg-primary text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary transition-colors"
          >
            + New Workflow
          </button>
        </div>
        {workflows.length === 0 ? (
          <p className="text-muted-foreground py-4">No workflows yet. Create one or use a template below.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflows.map((w) => (
              <div
                key={w.id}
                className="bg-card border border-border rounded-lg p-4 hover:border-border transition-colors group cursor-pointer"
                onClick={() => router.push(`/workflows/${w.id}`)}
              >
                <p className="text-foreground font-medium mb-1">{w.name}</p>
                {w.description && <p className="text-muted-foreground text-sm mb-2">{w.description}</p>}
                <div className="flex items-center justify-between text-muted-foreground text-xs">
                  <span>{w.steps.length} step{w.steps.length !== 1 ? 's' : ''}</span>
                  <span>{formatRelativeDate(w.updated_at)}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(w.id); }}
                  className="mt-2 text-muted-foreground hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Templates */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Templates</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflowTemplates.map((t) => (
            <div
              key={t.name}
              className="bg-card border border-border rounded-lg p-4 hover:border-primary transition-colors cursor-pointer"
              onClick={() => createWorkflow(t.name, t.description, t.steps)}
            >
              <p className="text-foreground font-medium mb-1">{t.name}</p>
              <p className="text-muted-foreground text-sm mb-2">{t.description}</p>
              <span className="text-primary text-xs">{t.steps.length} steps — Click to use</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
