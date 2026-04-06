import type { WorkflowStep } from './types';

export interface WorkflowTemplate {
  name: string;
  description: string;
  steps: WorkflowStep[];
}

export const workflowTemplates: WorkflowTemplate[] = [
  {
    name: 'Summarize & Action Items',
    description: 'Summarize content and extract action items',
    steps: [
      { name: 'Summarize', prompt: 'Summarize the following concisely:\n\n{{input}}', model: 'fast' },
      { name: 'Extract Actions', prompt: 'From this summary, extract a bulleted list of action items:\n\n{{previous}}', model: 'fast' },
    ],
  },
  {
    name: 'Code Review',
    description: 'Analyze code for bugs and suggest improvements',
    steps: [
      { name: 'Find Issues', prompt: 'Review this code for bugs, security issues, and bad practices. List each issue found:\n\n{{input}}', model: 'smart' },
      { name: 'Suggest Fixes', prompt: 'For each issue found below, provide the corrected code:\n\n{{previous}}', model: 'smart' },
    ],
  },
  {
    name: 'Content Writer',
    description: 'Outline, draft, and polish content',
    steps: [
      { name: 'Outline', prompt: 'Create a detailed outline for the following topic:\n\n{{input}}', model: 'fast' },
      { name: 'Draft', prompt: 'Write a full draft based on this outline:\n\n{{previous}}', model: 'smart' },
      { name: 'Polish', prompt: 'Edit and improve the following draft. Fix grammar, improve clarity, make it engaging:\n\n{{previous}}', model: 'fast' },
    ],
  },
];
