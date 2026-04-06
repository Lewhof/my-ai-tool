import type { Node, Edge } from '@xyflow/react';

export interface DiagramTemplate {
  id: string;
  name: string;
  description: string;
  nodes: Node[];
  edges: Edge[];
}

export const diagramTemplates: DiagramTemplate[] = [
  {
    id: 'flowchart',
    name: 'Basic Flowchart',
    description: 'Start/End with decision branch',
    nodes: [
      { id: 's1', type: 'start', position: { x: 250, y: 0 }, data: { label: 'Start' } },
      { id: 'p1', type: 'process', position: { x: 225, y: 100 }, data: { label: 'Process Input' } },
      { id: 'd1', type: 'decision', position: { x: 215, y: 220 }, data: { label: 'Valid?' } },
      { id: 'p2', type: 'process', position: { x: 50, y: 340 }, data: { label: 'Handle Error' } },
      { id: 'p3', type: 'process', position: { x: 400, y: 340 }, data: { label: 'Process Data' } },
      { id: 'e1', type: 'end', position: { x: 250, y: 460 }, data: { label: 'End' } },
    ],
    edges: [
      { id: 'e-s1-p1', source: 's1', target: 'p1' },
      { id: 'e-p1-d1', source: 'p1', target: 'd1' },
      { id: 'e-d1-p2', source: 'd1', target: 'p2', label: 'No' },
      { id: 'e-d1-p3', source: 'd1', target: 'p3', sourceHandle: 'right', label: 'Yes' },
      { id: 'e-p2-e1', source: 'p2', target: 'e1' },
      { id: 'e-p3-e1', source: 'p3', target: 'e1' },
    ],
  },
  {
    id: 'microservices',
    name: 'Microservices Architecture',
    description: 'API Gateway with services and database',
    nodes: [
      { id: 'actor', type: 'actor', position: { x: 300, y: 0 }, data: { label: 'Client' } },
      { id: 'cloud', type: 'cloud', position: { x: 280, y: 100 }, data: { label: 'API Gateway' } },
      { id: 'svc1', type: 'process', position: { x: 60, y: 240 }, data: { label: 'Auth Service' } },
      { id: 'svc2', type: 'process', position: { x: 280, y: 240 }, data: { label: 'User Service' } },
      { id: 'svc3', type: 'process', position: { x: 500, y: 240 }, data: { label: 'Order Service' } },
      { id: 'db1', type: 'database', position: { x: 60, y: 380 }, data: { label: 'Auth DB' } },
      { id: 'db2', type: 'database', position: { x: 280, y: 380 }, data: { label: 'User DB' } },
      { id: 'db3', type: 'database', position: { x: 500, y: 380 }, data: { label: 'Order DB' } },
    ],
    edges: [
      { id: 'e1', source: 'actor', target: 'cloud' },
      { id: 'e2', source: 'cloud', target: 'svc1' },
      { id: 'e3', source: 'cloud', target: 'svc2' },
      { id: 'e4', source: 'cloud', target: 'svc3' },
      { id: 'e5', source: 'svc1', target: 'db1' },
      { id: 'e6', source: 'svc2', target: 'db2' },
      { id: 'e7', source: 'svc3', target: 'db3' },
    ],
  },
  {
    id: 'user-journey',
    name: 'User Journey',
    description: 'Sign-up flow with decision points',
    nodes: [
      { id: 's', type: 'start', position: { x: 250, y: 0 }, data: { label: 'Landing Page' } },
      { id: 'p1', type: 'process', position: { x: 225, y: 100 }, data: { label: 'Sign Up Form' } },
      { id: 'd1', type: 'decision', position: { x: 215, y: 220 }, data: { label: 'Email Verified?' } },
      { id: 'p2', type: 'process', position: { x: 50, y: 340 }, data: { label: 'Send Verification' } },
      { id: 'p3', type: 'process', position: { x: 400, y: 340 }, data: { label: 'Onboarding' } },
      { id: 'p4', type: 'process', position: { x: 400, y: 460 }, data: { label: 'Dashboard' } },
      { id: 'e', type: 'end', position: { x: 430, y: 560 }, data: { label: 'Active User' } },
    ],
    edges: [
      { id: 'e1', source: 's', target: 'p1' },
      { id: 'e2', source: 'p1', target: 'd1' },
      { id: 'e3', source: 'd1', target: 'p2', label: 'No' },
      { id: 'e4', source: 'd1', target: 'p3', sourceHandle: 'right', label: 'Yes' },
      { id: 'e5', source: 'p2', target: 'd1' },
      { id: 'e6', source: 'p3', target: 'p4' },
      { id: 'e7', source: 'p4', target: 'e' },
    ],
  },
  {
    id: 'er-diagram',
    name: 'ER Diagram',
    description: 'Entity-relationship database schema',
    nodes: [
      { id: 'users', type: 'database', position: { x: 50, y: 100 }, data: { label: 'Users' } },
      { id: 'orders', type: 'database', position: { x: 300, y: 100 }, data: { label: 'Orders' } },
      { id: 'products', type: 'database', position: { x: 550, y: 100 }, data: { label: 'Products' } },
      { id: 'categories', type: 'database', position: { x: 550, y: 260 }, data: { label: 'Categories' } },
      { id: 'reviews', type: 'database', position: { x: 300, y: 260 }, data: { label: 'Reviews' } },
    ],
    edges: [
      { id: 'e1', source: 'users', target: 'orders', sourceHandle: 'right', label: '1:N' },
      { id: 'e2', source: 'orders', target: 'products', sourceHandle: 'right', label: 'N:M' },
      { id: 'e3', source: 'products', target: 'categories', label: 'N:1' },
      { id: 'e4', source: 'users', target: 'reviews', label: '1:N' },
      { id: 'e5', source: 'products', target: 'reviews', label: '1:N' },
    ],
  },
];
