// GitHub Pages serves static assets; shared rooms can use an external API.
const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
export const apiAvailable = !import.meta.env.VITE_STATIC_HOST || Boolean(apiBase);
export const apiUrl = (path: string) => `${apiBase}${path}`;
