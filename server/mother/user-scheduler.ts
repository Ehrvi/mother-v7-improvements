/**
 * User Scheduler — server/mother/user-scheduler.ts
 * MOTHER v96.0 | Ciclo C214 | NC-SENS-005
 *
 * Enables users to schedule tasks via natural language:
 * "Remind me every Monday at 9am to review metrics"
 * "Send a report every Friday at 5pm"
 * "Run analysis in 2 hours"
 *
 * Scientific basis:
 * - Nakano et al. (2021) "WebGPT: Browser-assisted question-answering with human feedback"
 *   arXiv:2112.09332 — persistent task execution
 * - Park et al. (2023) "Generative Agents: Interactive Simulacra of Human Behavior"
 *   arXiv:2304.03442 — scheduled agent behaviors
 * - Cron expression standard: IEEE Std 1003.1 (POSIX)
 */

export interface ScheduledTask {
  id: string;
  userId: string;
  description: string;
  cronExpression: string;     // 6-field: sec min hour dom month dow
  prompt: string;             // The task to execute when triggered
  isActive: boolean;
  createdAt: Date;
  lastRunAt?: Date;
  nextRunAt?: Date;
  runCount: number;
  repeat: boolean;
}

export interface ScheduleParseResult {
  success: boolean;
  cronExpression?: string;
  description?: string;
  isRepeat?: boolean;
  error?: string;
  naturalLanguageInput: string;
}

// Natural language patterns for schedule parsing
const SCHEDULE_PATTERNS: Array<{
  pattern: RegExp;
  toCron: (match: RegExpMatchArray) => string;
  description: (match: RegExpMatchArray) => string;
  repeat: boolean;
}> = [
  // "every day at HH:MM"
  {
    pattern: /every\s+day\s+at\s+(\d{1,2}):(\d{2})\s*(am|pm)?/i,
    toCron: (m) => {
      let hour = parseInt(m[1]);
      if (m[3]?.toLowerCase() === 'pm' && hour < 12) hour += 12;
      if (m[3]?.toLowerCase() === 'am' && hour === 12) hour = 0;
      return `0 ${m[2]} ${hour} * * *`;
    },
    description: (m) => `Every day at ${m[1]}:${m[2]}${m[3] ? ' ' + m[3].toUpperCase() : ''}`,
    repeat: true,
  },
  // "every Monday/Tuesday/... at HH:MM"
  {
    pattern: /every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(\d{1,2}):(\d{2})\s*(am|pm)?/i,
    toCron: (m) => {
      const days: Record<string, number> = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };
      let hour = parseInt(m[2]);
      if (m[4]?.toLowerCase() === 'pm' && hour < 12) hour += 12;
      return `0 ${m[3]} ${hour} * * ${days[m[1].toLowerCase()]}`;
    },
    description: (m) => `Every ${m[1]} at ${m[2]}:${m[3]}${m[4] ? ' ' + m[4].toUpperCase() : ''}`,
    repeat: true,
  },
  // "every N hours"
  {
    pattern: /every\s+(\d+)\s+hours?/i,
    toCron: (m) => `0 0 */${m[1]} * * *`,
    description: (m) => `Every ${m[1]} hour(s)`,
    repeat: true,
  },
  // "every N minutes"
  {
    pattern: /every\s+(\d+)\s+minutes?/i,
    toCron: (m) => `0 */${m[1]} * * * *`,
    description: (m) => `Every ${m[1]} minute(s)`,
    repeat: true,
  },
  // "in N hours"
  {
    pattern: /in\s+(\d+)\s+hours?/i,
    toCron: (m) => {
      const future = new Date(Date.now() + parseInt(m[1]) * 3600000);
      return `0 ${future.getMinutes()} ${future.getHours()} ${future.getDate()} ${future.getMonth() + 1} *`;
    },
    description: (m) => `Once in ${m[1]} hour(s)`,
    repeat: false,
  },
  // "in N minutes"
  {
    pattern: /in\s+(\d+)\s+minutes?/i,
    toCron: (m) => {
      const future = new Date(Date.now() + parseInt(m[1]) * 60000);
      return `${future.getSeconds()} ${future.getMinutes()} ${future.getHours()} ${future.getDate()} ${future.getMonth() + 1} *`;
    },
    description: (m) => `Once in ${m[1]} minute(s)`,
    repeat: false,
  },
];

// In-memory task store (production: MySQL table scheduled_tasks)
const scheduledTasks = new Map<string, ScheduledTask>();

/**
 * Parse natural language schedule expression into cron format.
 */
export function parseScheduleExpression(input: string): ScheduleParseResult {
  const normalized = input.toLowerCase().trim();

  for (const { pattern, toCron, description, repeat } of SCHEDULE_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) {
      try {
        const cronExpression = toCron(match);
        return {
          success: true,
          cronExpression,
          description: description(match),
          isRepeat: repeat,
          naturalLanguageInput: input,
        };
      } catch (err) {
        continue;
      }
    }
  }

  return {
    success: false,
    error: `Could not parse schedule expression: "${input}". Examples: "every day at 9:00 am", "every Monday at 5:00 pm", "in 2 hours"`,
    naturalLanguageInput: input,
  };
}

/**
 * Detect if a query contains a scheduling request.
 */
export function detectSchedulingRequest(query: string): {
  isScheduleRequest: boolean;
  scheduleExpression?: string;
  taskDescription?: string;
} {
  const scheduleKeywords = /\b(schedule|remind|every|in \d+ (hour|minute)|at \d+:\d+|recurring|repeat|daily|weekly|monthly)\b/i;

  if (!scheduleKeywords.test(query)) {
    return { isScheduleRequest: false };
  }

  // Extract schedule expression from query
  const schedulePatterns = [
    /every\s+\w+(?:\s+at\s+\d{1,2}:\d{2}(?:\s*(?:am|pm))?)?/i,
    /in\s+\d+\s+(?:hours?|minutes?)/i,
    /at\s+\d{1,2}:\d{2}(?:\s*(?:am|pm))?/i,
  ];

  for (const pattern of schedulePatterns) {
    const match = query.match(pattern);
    if (match) {
      return {
        isScheduleRequest: true,
        scheduleExpression: match[0],
        taskDescription: query.replace(match[0], '').trim(),
      };
    }
  }

  return { isScheduleRequest: true };
}

/**
 * Create a new scheduled task.
 */
export function createScheduledTask(
  userId: string,
  description: string,
  cronExpression: string,
  prompt: string,
  repeat: boolean
): ScheduledTask {
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const task: ScheduledTask = {
    id,
    userId,
    description,
    cronExpression,
    prompt,
    isActive: true,
    createdAt: new Date(),
    runCount: 0,
    repeat,
  };

  scheduledTasks.set(id, task);
  return task;
}

/**
 * Generate schedule confirmation message for user.
 */
export function generateScheduleConfirmation(task: ScheduledTask): string {
  return [
    `✅ **Tarefa Agendada com Sucesso**`,
    `**ID:** ${task.id}`,
    `**Descrição:** ${task.description}`,
    `**Expressão Cron:** \`${task.cronExpression}\``,
    `**Repetição:** ${task.repeat ? 'Sim (recorrente)' : 'Não (única execução)'}`,
    `**Criada em:** ${task.createdAt.toLocaleString('pt-BR')}`,
    `\nPara cancelar: "Cancelar tarefa ${task.id}"`,
  ].join('\n');
}

/**
 * Get all active tasks for a user.
 */
export function getUserScheduledTasks(userId: string): ScheduledTask[] {
  return Array.from(scheduledTasks.values()).filter(
    t => t.userId === userId && t.isActive
  );
}

/**
 * Cancel a scheduled task.
 */
export function cancelScheduledTask(taskId: string): boolean {
  const task = scheduledTasks.get(taskId);
  if (!task) return false;
  task.isActive = false;
  return true;
}
