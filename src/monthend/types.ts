export type Severity = "info" | "warn" | "critical";

export type Finding = {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  metric?: number;          // e.g., dollars or %
  link?: string;            // optional deep link to QBO report
  meta?: Record<string, any>;
};
