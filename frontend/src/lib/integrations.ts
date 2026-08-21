import { API_ROOT, platformFetch } from "@/lib/platform-fetch";

export interface IntegrationAction {
  id: string;
  label: string;
  description: string;
  readOnly: boolean;
}

export interface IntegrationDefinition {
  slug: string;
  name: string;
  category: string;
  description: string;
  capabilities: string[];
  actions: IntegrationAction[];
  configured: boolean;
}

export interface IntegrationConnection {
  id: string;
  toolkit: string;
  status: "ACTIVE" | "INITIALIZING" | "PENDING" | "FAILED" | "EXPIRED" | string;
  alias?: string;
  connectedAt?: string;
  updatedAt?: string;
}

export interface ConnectLink {
  redirectUrl: string;
  connectionId?: string;
  expiresAt?: string;
}

export interface CompletedConnection {
  connectionId: string;
  toolkit: string;
}

export interface ToolExecutionResult {
  action: string;
  successful: boolean;
  result: {
    items?: IntegrationSearchItem[];
    document?: ImportedIntegrationDocument;
    operation?: IntegrationOperationResult;
  };
}

export interface IntegrationOperationResult {
  service: string;
  message: string;
  url?: string;
}

export interface IntegrationSearchItem {
  id: string;
  title: string;
  subtitle?: string;
  preview?: string;
  reference: Record<string, string>;
}

export interface ImportedIntegrationDocument {
  title: string;
  content: string;
  sourceLabel: string;
  sourceUrl?: string;
}

export const PENDING_INTEGRATION_KEY = "chatsaver:integration-pending";
export const INTEGRATION_CONNECTED_EVENT = "chatsaver:integration-connected";

export interface PendingIntegrationAuthentication {
  toolkit: string;
  connectionId?: string;
  startedAt: number;
}

export function rememberPendingIntegration(pending: PendingIntegrationAuthentication): void {
  try { localStorage.setItem(PENDING_INTEGRATION_KEY, JSON.stringify(pending)); } catch { /* ignored */ }
}

export function readPendingIntegration(): PendingIntegrationAuthentication | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_INTEGRATION_KEY) ?? "null") as Partial<PendingIntegrationAuthentication> | null;
    if (!value || typeof value.toolkit !== "string" || typeof value.startedAt !== "number") return undefined;
    return { toolkit: value.toolkit, connectionId: value.connectionId, startedAt: value.startedAt };
  } catch {
    return undefined;
  }
}

export function announceIntegrationConnected(connectionId: string, toolkit: string): void {
  const detail = { type: INTEGRATION_CONNECTED_EVENT, connectionId, toolkit, completedAt: Date.now() };
  try {
    localStorage.removeItem(PENDING_INTEGRATION_KEY);
    localStorage.setItem(INTEGRATION_CONNECTED_EVENT, JSON.stringify(detail));
  } catch { /* ignored */ }
  try { window.dispatchEvent(new CustomEvent(INTEGRATION_CONNECTED_EVENT, { detail })); } catch { /* ignored */ }
  try { window.opener?.postMessage(detail, window.location.origin); } catch { /* ignored */ }
}

async function integrationRequest<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await platformFetch(path, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...init.headers,
      },
    });
  } catch {
    throw new Error(
      API_ROOT
        ? "ChatSaver could not reach its integration service."
        : "Integrations are not configured for this deployment yet.",
    );
  }

  const text = await response.text();
  if (!response.ok) {
    let detail: string | undefined;
    try {
      const problem = text ? JSON.parse(text) as { detail?: string; message?: string } : undefined;
      detail = problem?.detail ?? problem?.message;
    } catch {
      // Provider response details are intentionally not exposed by the API.
    }
    throw new Error(detail ?? `Integration request failed (${response.status}).`);
  }
  return text ? JSON.parse(text) as T : undefined as T;
}

export function listIntegrations(accessToken: string): Promise<IntegrationDefinition[]> {
  return integrationRequest("/api/v1/integrations", accessToken);
}

export function listIntegrationConnections(accessToken: string): Promise<IntegrationConnection[]> {
  return integrationRequest("/api/v1/integrations/connections", accessToken);
}

export function createIntegrationConnectLink(
  accessToken: string,
  toolkit: string,
): Promise<ConnectLink> {
  return integrationRequest(
    `/api/v1/integrations/${encodeURIComponent(toolkit)}/connect`,
    accessToken,
    { method: "POST", body: "{}" },
  );
}

export function completeIntegrationAuthentication(
  accessToken: string,
  sessionUri: string,
): Promise<CompletedConnection> {
  return integrationRequest("/api/v1/integrations/callback/complete", accessToken, {
    method: "POST",
    body: JSON.stringify({ sessionUri }),
  });
}

export function disconnectIntegration(
  accessToken: string,
  connectionId: string,
): Promise<void> {
  return integrationRequest(
    `/api/v1/integrations/connections/${encodeURIComponent(connectionId)}`,
    accessToken,
    { method: "DELETE" },
  );
}

export function executeIntegrationAction(
  accessToken: string,
  connectionId: string,
  action: string,
  input: Record<string, string> = {},
): Promise<ToolExecutionResult> {
  return integrationRequest(
    `/api/v1/integrations/connections/${encodeURIComponent(connectionId)}/execute`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ action, input }),
    },
  );
}
