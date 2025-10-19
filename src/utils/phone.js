export function isE164Phone(v) {
  return typeof v === "string" && /^\+[1-9]\d{6,14}$/.test(v.trim());
}
