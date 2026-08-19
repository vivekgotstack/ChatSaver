const configuredApiRoot = process.env.NEXT_PUBLIC_API_ORIGIN?.trim() ?? "";

export const API_ROOT = configuredApiRoot.replace(/\/$/, "");

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function platformFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const isTauri = isTauriRuntime();
  let resolvedInput = input;
  if (typeof input === "string" && input.startsWith("/")) {
    const runtimeRoot = API_ROOT || (isTauri ? window.location.origin : "");
    resolvedInput = `${runtimeRoot}${input}`;
  }

  if (!isTauri) return fetch(resolvedInput, init);

  const { fetch: nativeFetch } = await import("@tauri-apps/plugin-http");
  return nativeFetch(resolvedInput, init);
}
