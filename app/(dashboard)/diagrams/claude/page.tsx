'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { aiStackNodes, aiStackEdges } from '@/lib/diagrams/ai-stack';

const DiagramCanvas = dynamic(() => import('@/components/diagrams/diagram-canvas'), { ssr: false });

const DIAGRAMS = [
  { id: 'ai-stack', name: 'AI Stack Architecture', description: 'Proposed tech stack with build status' },
];

export default function ClaudeDiagramsPage() {
  const [activeDiagram, setActiveDiagram] = useState('ai-stack');

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar */}
      <div className="hidden md:flex md:w-56 border-r border-border flex-col shrink-0">
        <div className="px-4 py-3 border-b border-border">
          <Link href="/diagrams" className="text-muted-foreground text-sm hover:text-foreground transition-colors">
            &larr; All Diagrams
          </Link>
          <h3 className="text-foreground font-semibold mt-2">Claude Diagrams</h3>
          <p className="text-muted-foreground text-xs mt-0.5">AI-generated diagrams</p>
        </div>
        <div className="flex-1 overflow-auto">
          {DIAGRAMS.map((d) => (
            <button
              key={d.id}
              onClick={() => setActiveDiagram(d.id)}
              className={cn(
                'w-full text-left px-4 py-3 border-b border-border transition-colors',
                activeDiagram === d.id ? 'bg-secondary' : 'hover:bg-card'
              )}
            >
              <p className="text-foreground text-sm font-medium">{d.name}</p>
              <p className="text-muted-foreground text-xs mt-0.5">{d.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-w-0 min-h-0">
        {activeDiagram === 'ai-stack' && (
          <DiagramCanvas
            initialNodes={aiStackNodes}
            initialEdges={aiStackEdges}
            readOnly
          />
        )}
      </div>
    </div>
  );
}
