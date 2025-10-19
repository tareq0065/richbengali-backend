/**
 * Development-only log helpers.
 * In production (NODE_ENV!=='development'), these are no-ops.
 */
const isDev = process.env.NODE_ENV === "development";

export const devLog = (...args) => {
  if (isDev) console.log("[DEV]", ...args);
};
export const devInfo = (...args) => {
  if (isDev) console.info("[DEV]", ...args);
};
export const devWarn = (...args) => {
  if (isDev) console.warn("[DEV]", ...args);
};
export const devError = (...args) => {
  if (isDev) console.error("[DEV]", ...args);
};
