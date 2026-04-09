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
    name: 'complete_todos',
    description: 'Mark one or more to-do items as complete/done. Accepts fuzzy title matches — e.g. "SARS", "golfday", "Talisman" will match tasks containing those words. Returns which tasks were matched and updated. ALWAYS use this when the user says "mark X done", "X is complete", "I finished X", etc. DO NOT claim something is complete without calling this tool first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        titles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of task titles or keywords to match. Can be fuzzy — e.g. ["SARS", "Talisman"] will match "Pay SARS PAYE" and "Pay Talisman". Case-insensitive, matches partial strings.',
        },
      },
      required: ['titles'],
    },
  },
  {
    name: 'update_todo',
    description: 'Update an existing to-do item (change title, description, priority, due date, status, or bucket). Match by id OR fuzzy title. Use this for any task modification other than completion — for completion use complete_todos instead.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The task ID (if known). If omitted, title_match is used.' },
        title_match: { type: 'string', description: 'Fuzzy title match — case-insensitive substring search. Only used if id is not provided.' },
        title: { type: 'string', description: 'New title' },
        description: { type: 'string', description: 'New description' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'New priority' },
        due_date: { type: 'string', description: 'New due date YYYY-MM-DD, or empty string to clear' },
        status: { type: 'string', enum: ['todo', 'in-progress', 'done'], description: 'New status' },
        bucket: { type: 'string', description: 'New bucket/category' },
      },
      required: [],
    },
  },
  {
    name: 'delete_todo',
    description: 'Delete a to-do item. Match by id OR fuzzy title. Only use when the user explicitly says "delete", "remove", or "get rid of" a task.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The task ID (if known)' },
        title_match: { type: 'string', description: 'Fuzzy title match — case-insensitive substring search. Only used if id is not provided.' },
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
  {
    name: 'get_emails',
    description: 'Get recent emails from Outlook inbox. Can check for unread emails.',
    input_schema: {
      type: 'object' as const,
      properties: {
        folder: { type: 'string', enum: ['inbox', 'sent', 'drafts'], description: 'Email folder. Default inbox.' },
        limit: { type: 'number', description: 'Number of emails to return. Default 10.' },
      },
      required: [],
    },
  },
  {
    name: 'triage_emails',
    description: 'AI-powered triage of unread emails. Categorizes as IMPORTANT, CAN_WAIT, or FYI with summaries.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'push_to_claude_code',
    description: 'Push a development task to Claude Code for implementation. The task will be queued and picked up by the next Claude Code session.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Task title describing what to build or fix' },
        description: { type: 'string', description: 'Detailed scope and requirements' },
      },
      required: ['title'],
    },
  },
];
