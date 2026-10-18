// Static builds use transparent local profiles unless an API is configured.
const env = import.meta.env;
const apiBase = (env?.VITE_API_BASE_URL || "").replace(/\/$/, "");
export const apiAvailable = Boolean(env && (!env.VITE_STATIC_HOST || apiBase));
export const apiUrl = (path: string) => `${apiBase}${path}`;
