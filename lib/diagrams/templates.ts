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
  {
    id: 'organogram',
    name: 'Organogram',
    description: 'Company organisational structure',
    nodes: [
      { id: 'ceo', type: 'rectangle', position: { x: 300, y: 0 }, data: { label: 'CEO' } },
      { id: 'cfo', type: 'rectangle', position: { x: 50, y: 120 }, data: { label: 'CFO' } },
      { id: 'cto', type: 'rectangle', position: { x: 300, y: 120 }, data: { label: 'CTO' } },
      { id: 'coo', type: 'rectangle', position: { x: 550, y: 120 }, data: { label: 'COO' } },
      { id: 'fin1', type: 'rectangle', position: { x: -50, y: 250 }, data: { label: 'Finance Manager' } },
      { id: 'fin2', type: 'rectangle', position: { x: 150, y: 250 }, data: { label: 'Accountant' } },
      { id: 'dev1', type: 'rectangle', position: { x: 250, y: 250 }, data: { label: 'Dev Lead' } },
      { id: 'dev2', type: 'rectangle', position: { x: 420, y: 250 }, data: { label: 'Designer' } },
      { id: 'ops1', type: 'rectangle', position: { x: 520, y: 250 }, data: { label: 'Ops Manager' } },
      { id: 'ops2', type: 'rectangle', position: { x: 690, y: 250 }, data: { label: 'HR Manager' } },
    ],
    edges: [
      { id: 'e1', source: 'ceo', target: 'cfo' },
      { id: 'e2', source: 'ceo', target: 'cto' },
      { id: 'e3', source: 'ceo', target: 'coo' },
      { id: 'e4', source: 'cfo', target: 'fin1' },
      { id: 'e5', source: 'cfo', target: 'fin2' },
      { id: 'e6', source: 'cto', target: 'dev1' },
      { id: 'e7', source: 'cto', target: 'dev2' },
      { id: 'e8', source: 'coo', target: 'ops1' },
      { id: 'e9', source: 'coo', target: 'ops2' },
    ],
  },
  {
    id: 'swot',
    name: 'SWOT Analysis',
    description: 'Strengths, Weaknesses, Opportunities, Threats',
    nodes: [
      { id: 'title', type: 'rectangle', position: { x: 225, y: 0 }, data: { label: 'SWOT Analysis' } },
      { id: 's', type: 'rectangle', position: { x: 0, y: 100 }, data: { label: 'Strengths\n• Point 1\n• Point 2' } },
      { id: 'w', type: 'rectangle', position: { x: 280, y: 100 }, data: { label: 'Weaknesses\n• Point 1\n• Point 2' } },
      { id: 'o', type: 'rectangle', position: { x: 0, y: 260 }, data: { label: 'Opportunities\n• Point 1\n• Point 2' } },
      { id: 't', type: 'rectangle', position: { x: 280, y: 260 }, data: { label: 'Threats\n• Point 1\n• Point 2' } },
    ],
    edges: [],
  },
  {
    id: 'stakeholder',
    name: 'Stakeholder Map',
    description: 'Key stakeholders and relationships',
    nodes: [
      { id: 'core', type: 'rectangle', position: { x: 250, y: 150 }, data: { label: 'Project / Company' } },
      { id: 'inv', type: 'actor', position: { x: 50, y: 0 }, data: { label: 'Investors' } },
      { id: 'cust', type: 'actor', position: { x: 450, y: 0 }, data: { label: 'Customers' } },
      { id: 'emp', type: 'actor', position: { x: 50, y: 300 }, data: { label: 'Employees' } },
      { id: 'part', type: 'actor', position: { x: 450, y: 300 }, data: { label: 'Partners' } },
      { id: 'reg', type: 'actor', position: { x: 0, y: 150 }, data: { label: 'Regulators' } },
      { id: 'comp', type: 'actor', position: { x: 500, y: 150 }, data: { label: 'Competitors' } },
    ],
    edges: [
      { id: 'e1', source: 'inv', target: 'core' },
      { id: 'e2', source: 'cust', target: 'core' },
      { id: 'e3', source: 'emp', target: 'core' },
      { id: 'e4', source: 'part', target: 'core' },
      { id: 'e5', source: 'reg', target: 'core' },
      { id: 'e6', source: 'comp', target: 'core' },
    ],
  },
];
