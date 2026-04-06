import { auth } from '@clerk/nextjs/server';
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';
import type { WorkflowStep } from '@/lib/types';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const { input } = await req.json();
  if (!input?.trim()) return Response.json({ error: 'Input required' }, { status: 400 });

  const { data: workflow } = await supabaseAdmin
    .from('workflows')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!workflow) return new Response('Not found', { status: 404 });

  const steps = workflow.steps as WorkflowStep[];
  if (steps.length === 0) {
    return Response.json({ error: 'Workflow has no steps' }, { status: 400 });
  }

  // Create run record
  const { data: run } = await supabaseAdmin
    .from('workflow_runs')
    .insert({ workflow_id: id, input, status: 'running' })
    .select('id')
    .single();

  const runId = run?.id;
  const stepResults: Array<{ step_name: string; content: string }> = [];
  let failed = false;

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let previousOutput = '';

      try {
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'step_start', step: i, name: step.name }) + '\n'));

          const prompt = step.prompt
            .replace(/\{\{input\}\}/g, input)
            .replace(/\{\{previous\}\}/g, previousOutput);

          const model = step.model === 'smart' ? MODELS.smart : MODELS.fast;

          const stream = anthropic.messages.stream({
            model,
            max_tokens: 2048,
            messages: [{ role: 'user', content: prompt }],
          });

          let stepContent = '';
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              stepContent += event.delta.text;
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'text_delta', text: event.delta.text }) + '\n'));
            }
          }

          previousOutput = stepContent;
          stepResults.push({ step_name: step.name, content: stepContent });
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'step_end', step: i }) + '\n'));
        }

        controller.enqueue(encoder.encode(JSON.stringify({ type: 'done', runId }) + '\n'));
        controller.close();
      } catch (err) {
        failed = true;
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' }) + '\n'));
        controller.close();
      }
    },
  });

  after(async () => {
    if (runId) {
      await supabaseAdmin
        .from('workflow_runs')
        .update({
          output: stepResults,
          status: failed ? 'failed' : 'completed',
        })
        .eq('id', runId);
    }
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
