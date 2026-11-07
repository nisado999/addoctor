import { apiFetch } from "./api.js";

/* The Meta routes of the AdDoctor server. The Meta login itself never reaches the browser. */
export const metaStatus = () => apiFetch("/meta/status");
export const metaConnectStart = () => apiFetch("/meta/connect/start", { method: "POST", body: {} });
export const metaAssets = () => apiFetch("/meta/assets", { timeout: 60000 });
export const metaSelect = (sel) => apiFetch("/meta/select", { body: sel, timeout: 60000 });
export const metaDisconnect = () => apiFetch("/meta/disconnect", { method: "POST", body: {} });
export const metaLaunch = (body) => apiFetch("/meta/launch", { body, timeout: 170000 });
export const metaActivate = (requestId) => apiFetch("/meta/activate", { body: { requestId }, timeout: 120000 });
