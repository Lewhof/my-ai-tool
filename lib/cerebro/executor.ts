import { recordToolMetric } from '@/lib/cerebro/evolution';
import { dispatch } from '@/lib/cerebro/directors';

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  userId: string
): Promise<string> {
  const start = Date.now();
  let success = true;
  let errorMsg: string | undefined;
  try {
    const result = await dispatch(toolName, input, userId);
    // Many tools return `Error: ...` strings rather than throwing — treat those
    // as failures for metrics purposes so the dashboard reflects reality.
    if (typeof result === 'string' && /^(error|tool error|unknown tool)/i.test(result.trim())) {
      success = false;
      errorMsg = result.slice(0, 300);
    }
    return result;
  } catch (err) {
    success = false;
    errorMsg = err instanceof Error ? err.message : 'unknown';
    return `Tool error: ${errorMsg}`;
  } finally {
    // Fire-and-forget metric — never blocks the request.
    void recordToolMetric(userId, toolName, Date.now() - start, success, errorMsg);
  }
}
