import * as research from './research';
import * as operations from './operations';
import * as creative from './creative';
import * as wellness from './wellness';

const RESEARCH = new Set<string>(research.RESEARCH_TOOLS);
const OPERATIONS = new Set<string>(operations.OPERATIONS_TOOLS);
const CREATIVE = new Set<string>(creative.CREATIVE_TOOLS);
const WELLNESS = new Set<string>(wellness.WELLNESS_TOOLS);

export async function dispatch(
  toolName: string,
  input: Record<string, unknown>,
  userId: string
): Promise<string> {
  if (RESEARCH.has(toolName)) return research.handle(toolName, input, userId);
  if (OPERATIONS.has(toolName)) return operations.handle(toolName, input, userId);
  if (CREATIVE.has(toolName)) return creative.handle(toolName, input, userId);
  if (WELLNESS.has(toolName)) return wellness.handle(toolName, input, userId);
  return `Unknown tool: ${toolName}`;
}

export { research, operations, creative, wellness };
