export type MessageRole = 'user' | 'assistant';

export interface ChatThread {
  id: string;
  user_id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  role: MessageRole;
  content: string;
  model: string | null;
  tokens_used: number | null;
  created_at: string;
}

export interface Document {
  id: string;
  user_id: string;
  name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

export interface Workflow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  steps: WorkflowStep[];
  created_at: string;
  updated_at: string;
}

export interface WorkflowStep {
  name: string;
  prompt: string;
  model: 'fast' | 'smart';
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  input: string;
  output: WorkflowStepResult[];
  status: 'running' | 'completed' | 'failed';
  created_at: string;
}

export interface WorkflowStepResult {
  step_name: string;
  content: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  default_model: 'fast' | 'smart';
  dashboard_layout: string[];
  theme: string;
}
