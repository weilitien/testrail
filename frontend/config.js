// Shared frontend configuration.
// In production, env.js can set window.API_BASE before app.js loads.
export const API_BASE = window.API_BASE || "http://localhost:8000";

export const STATUSES = ["NOT_RUN", "PASS", "FAIL", "BLOCKED", "SKIPPED"];
