import { getSettings } from "../settings";

function requireBackendUrl(): string {
  const { backendUrl } = getSettings();
  if (!backendUrl) {
    throw new Error("No server address configured. Set one in the add-on's Settings screen first.");
  }
  return backendUrl;
}

async function requestJson(url: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

export async function createRemoteEvent(payload: unknown): Promise<{ status: number; body: any }> {
  const backendUrl = requireBackendUrl();
  return requestJson(`${backendUrl}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function listRemoteEvents(): Promise<{ status: number; body: any }> {
  const backendUrl = requireBackendUrl();
  return requestJson(`${backendUrl}/events`);
}

export async function joinRemoteEvent(id: string, payload: unknown): Promise<{ status: number; body: any }> {
  const backendUrl = requireBackendUrl();
  return requestJson(`${backendUrl}/events/${encodeURIComponent(id)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteRemoteEvent(id: string, hostToken: string): Promise<{ status: number; body: any }> {
  const backendUrl = requireBackendUrl();
  return requestJson(`${backendUrl}/events/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "X-Host-Token": hostToken },
  });
}
