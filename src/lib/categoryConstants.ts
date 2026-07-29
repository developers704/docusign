export const REMINDER_FREQUENCY_OPTIONS = [
  { id: "none", label: "None" },
  { id: "every_day", label: "Every day" },
  { id: "every_2_days", label: "Every 2 days" },
  { id: "every_3_days", label: "Every 3 days" },
  { id: "every_week", label: "Every week" },
] as const;

export type ReminderFrequency = (typeof REMINDER_FREQUENCY_OPTIONS)[number]["id"];

export const DEFAULT_CATEGORIES = [
  "HR",
  "Sales",
  "Legal",
  "Finance",
  "Operations",
  "Onboarding",
  "Compliance",
  "Other",
];
