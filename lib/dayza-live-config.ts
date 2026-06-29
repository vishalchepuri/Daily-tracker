import { Modality } from "@google/genai";

export const DAYZA_LIVE_MODEL = process.env.NEXT_PUBLIC_DAYZA_LIVE_MODEL || "gemini-3.1-flash-live-preview";
export const DAYZA_LIVE_MAX_SESSION_MINUTES = Math.min(
  20,
  Math.max(1, Number(process.env.DAYZA_LIVE_MAX_SESSION_MINUTES || 10) || 10)
);

export const DAYZA_LIVE_SYSTEM_INSTRUCTION = `
You are Dayza, a warm real-time voice assistant inside the user's personal Dayza app.
Speak naturally and briefly like a helpful friend. Prefer short answers unless the user asks for detail.
You can read app context immediately. Before creating, completing, logging, or updating anything, ask for a clear confirmation.
If the user confirms a pending action, call the matching write tool.
Never delete data or perform destructive edits in Live mode. Ask the user to use the app UI for destructive actions.
Use India-friendly wording, INR, grams, and Asia/Kolkata time by default.
For health, fitness, medication, and finance, give practical support but do not claim medical or financial certainty.
`.trim();

export const dayzaLiveToolDeclarations = [
  {
    name: "get_today_overview",
    description: "Read today's Dayza overview: reminders, nutrition totals, water, workout, spends, and medications.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_reminders",
    description: "Read the user's active reminders or tasks.",
    parameters: {
      type: "object",
      properties: {
        filter: { type: "string", enum: ["today", "upcoming", "overdue", "all"] },
      },
      required: [],
    },
  },
  {
    name: "create_reminder",
    description: "Create a reminder after the user confirms it.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        notes: { type: "string" },
        dueDate: { type: "string", description: "ISO date/time if known. Use Asia/Kolkata assumption." },
        priority: { type: "string", enum: ["none", "low", "medium", "high"] },
        contextTag: { type: "string" },
        confirmed: { type: "boolean", description: "Must be true only after the user clearly confirms this write action." },
      },
      required: ["title"],
    },
  },
  {
    name: "complete_reminder",
    description: "Mark a matching reminder complete after the user confirms it.",
    parameters: {
      type: "object",
      properties: {
        reminderId: { type: "string" },
        title: { type: "string" },
        confirmed: { type: "boolean", description: "Must be true only after the user clearly confirms this write action." },
      },
      required: [],
    },
  },
  {
    name: "log_spend",
    description: "Log a spend after the user confirms it.",
    parameters: {
      type: "object",
      properties: {
        merchant: { type: "string" },
        amount: { type: "number" },
        currency: { type: "string" },
        category: { type: "string" },
        notes: { type: "string" },
        date: { type: "string" },
        confirmed: { type: "boolean", description: "Must be true only after the user clearly confirms this write action." },
      },
      required: ["merchant", "amount"],
    },
  },
  {
    name: "get_spend_summary",
    description: "Read spend totals and recent transactions.",
    parameters: {
      type: "object",
      properties: {
        range: { type: "string", enum: ["today", "week", "month"] },
      },
      required: [],
    },
  },
  {
    name: "log_food",
    description: "Log food or a meal after the user confirms it.",
    parameters: {
      type: "object",
      properties: {
        foodName: { type: "string" },
        mealType: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
        servingSize: { type: "string", description: "Prefer grams, e.g. 150 g." },
        calories: { type: "number" },
        protein: { type: "number" },
        carbs: { type: "number" },
        fat: { type: "number" },
        fiber: { type: "number" },
        confirmed: { type: "boolean", description: "Must be true only after the user clearly confirms this write action." },
      },
      required: ["foodName", "mealType"],
    },
  },
  {
    name: "log_water",
    description: "Log water intake after the user confirms it.",
    parameters: {
      type: "object",
      properties: {
        amountMl: { type: "number" },
        confirmed: { type: "boolean", description: "Must be true only after the user clearly confirms this write action." },
      },
      required: ["amountMl"],
    },
  },
  {
    name: "get_workout_plan",
    description: "Read saved workout plan days and exercises.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "log_workout_note",
    description: "Log a simple workout note after the user confirms it.",
    parameters: {
      type: "object",
      properties: {
        templateName: { type: "string" },
        duration: { type: "number" },
        notes: { type: "string" },
        confirmed: { type: "boolean", description: "Must be true only after the user clearly confirms this write action." },
      },
      required: [],
    },
  },
  {
    name: "get_profile_context",
    description: "Read profile basics and preferences used by Dayza.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "preview_agent_task_draft",
    description: "Run a read-only preview for a scheduled web-check agent task draft before it is saved.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        url: { type: "string" },
        prompt: { type: "string" },
        trainingNotes: { type: "string" },
        outputFormat: { type: "string" },
      },
      required: ["url", "prompt"],
    },
  },
];

export function agentTaskTrainingLiveInstruction(taskContext: any = {}) {
  const context = JSON.stringify({
    name: taskContext?.name ?? "",
    url: taskContext?.url ?? "",
    prompt: taskContext?.prompt ?? "",
    trainingNotes: taskContext?.trainingNotes ?? "",
    outputFormat: taskContext?.outputFormat ?? "",
    scheduleType: taskContext?.scheduleType ?? "",
    timeOfDay: taskContext?.timeOfDay ?? "",
  });

  return `
You are Dayza's real-time voice coach for training one scheduled Agent Task.
Speak like Gemini Live: brief, natural, and conversational.
Your job is to help the user refine what the task should check, what it should ignore, and exactly how the output should look.
If the user asks to test or run the draft, call preview_agent_task_draft with the current name, URL, prompt, trainingNotes, and outputFormat.
Do not save or schedule anything by voice. Tell the user to use the Save & Schedule button when the preview response is correct.
When the user says a response is correct, summarize the final instruction, training notes, and expected output clearly so the app can save it.
Current task draft: ${context}
`.trim();
}

export function dayzaLiveSetup(model = DAYZA_LIVE_MODEL, options: { systemInstruction?: string; tools?: any[] } = {}) {
  return {
    model: `models/${model}`,
    generationConfig: {
      responseModalities: [Modality.AUDIO],
      temperature: 0.8,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: "Puck",
          },
        },
      },
    },
    systemInstruction: {
      parts: [{ text: options.systemInstruction || DAYZA_LIVE_SYSTEM_INSTRUCTION }],
    },
    tools: [{ functionDeclarations: options.tools || dayzaLiveToolDeclarations }],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: {
      automaticActivityDetection: {
        disabled: false,
        silenceDurationMs: 1200,
        prefixPaddingMs: 300,
      },
      activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
      turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
    },
    sessionResumption: {},
  };
}
