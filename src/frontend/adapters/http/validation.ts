export function invalid(): never {
  throw new Error("The backend returned an invalid or unsupported response.");
}
export function object(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : invalid();
}
export function text(v: unknown): string {
  return typeof v === "string" && v.length > 0 && v.length <= 8000
    ? v
    : invalid();
}
export function list(v: unknown, limit = 1000): unknown[] {
  return Array.isArray(v) && v.length <= limit ? v : invalid();
}
export function texts(v: unknown): string[] {
  return list(v).map(text);
}
export function count(v: unknown): number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0
    ? v
    : invalid();
}
export function numeric(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : invalid();
}
export function choice<T extends string>(v: unknown, values: readonly T[]): T {
  return typeof v === "string" && values.includes(v as T)
    ? (v as T)
    : invalid();
}
export function nullable<T>(v: unknown, parse: (v: unknown) => T): T | null {
  return v === null ? null : parse(v);
}
export function percentage(v: unknown): number {
  const n = numeric(v);
  return n <= 100 ? n : invalid();
}
export function date(v: unknown): string {
  const s = text(v);
  return /^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/.test(s) &&
    Number.isFinite(Date.parse(s))
    ? s
    : invalid();
}
export function publicUrl(v: unknown): string {
  const s = text(v);
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return invalid();
  }
  return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password
    ? s
    : invalid();
}
export function data(v: unknown): Record<string, unknown> {
  const r = object(v);
  if (r.schema_version !== 1) invalid();
  return object(r.data);
}
export const modes = ["real", "synthetic", "mixed"] as const;
