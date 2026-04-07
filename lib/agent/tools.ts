import type Anthropic from '@anthropic-ai/sdk';

// Tool definitions for the Master Agent
export const AGENT_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'get_calendar',
    description: 'Get calendar events for today or upcoming days. Returns events from all connected Microsoft Calendar accounts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days_ahead: { type: 'number', description: 'Number of days to look ahead. Default 1 (today).' },
      },
      required: [],
    },
  },
  {
    name: 'create_todo',
    description: 'Create a new task/to-do item. Returns the created task.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description (optional)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Priority level' },
        due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format (optional)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'create_whiteboard_item',
    description: 'Add an item to the Whiteboard backlog. Use for feature ideas, bugs, or project items.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Item title' },
        description: { type: 'string', description: 'Description or scope details' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags like feature, bug, idea' },
      },
      required: ['title'],
    },
  },
  {
    name: 'search_documents',
    description: 'Search uploaded documents by name. Returns matching document names and IDs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query to match against document names' },
      },
      required: ['query'],
    },
  },
  {
    name: 'analyze_document',
    description: 'Analyze a specific document using AI. Extracts summary, key points, entities.',
    input_schema: {
      type: 'object' as const,
      properties: {
        document_id: { type: 'string', description: 'The document UUID to analyze' },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'generate_image',
    description: 'Generate an image using Google Gemini (Nano Banana). Returns the image.',
    input_schema: {
      type: 'object' as const,
      properties: {
        prompt: { type: 'string', description: 'Description of the image to generate' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'save_note',
    description: 'Create or update a note. If no note_id, creates a new note.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Note title' },
        content: { type: 'string', description: 'Note content (markdown supported)' },
        note_id: { type: 'string', description: 'Existing note ID to update (optional)' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'get_weather',
    description: 'Get current weather for a location. Defaults to Johannesburg.',
    input_schema: {
      type: 'object' as const,
      properties: {
        lat: { type: 'number', description: 'Latitude' },
        lon: { type: 'number', description: 'Longitude' },
      },
      required: [],
    },
  },
  {
    name: 'get_credits',
    description: 'Check AI usage and costs from Helicone. Returns spend, requests, tokens for different periods.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'search_kb',
    description: 'Search the Knowledge Base wiki for information. Returns matching entries.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_todos',
    description: 'Get current to-do items. Can filter by status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['todo', 'in-progress', 'done', 'all'], description: 'Filter by status. Default all.' },
      },
      required: [],
    },
  },
  {
    name: 'get_whiteboard',
    description: 'Get whiteboard/backlog items. Can filter by status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['idea', 'scoped', 'in-progress', 'done', 'parked', 'all'], description: 'Filter by status. Default all.' },
      },
      required: [],
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Create a calendar event in Microsoft Calendar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        subject: { type: 'string', description: 'Event title' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        start_time: { type: 'string', description: 'Start time in HH:MM format' },
        end_time: { type: 'string', description: 'End time in HH:MM format' },
        location: { type: 'string', description: 'Location (optional)' },
      },
      required: ['subject', 'date', 'start_time', 'end_time'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for current information. Use when the user asks about real-time data, news, or anything you might not know.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
];
