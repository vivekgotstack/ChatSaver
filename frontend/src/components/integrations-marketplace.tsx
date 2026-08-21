"use client";

import Image from "next/image";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Code2,
  FileDown,
  HardDrive,
  LoaderCircle,
  Lock,
  Mail,
  MessageCircle,
  Notebook,
  Plug,
  RefreshCw,
  Search,
  ShieldCheck,
  Unplug,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AccountDialog } from "@/components/account-dialog";
import { IntegrationImportDialog } from "@/components/integration-import-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SiteFooter } from "@/components/site-footer";
import {
  createIntegrationConnectLink,
  disconnectIntegration,
  INTEGRATION_CONNECTED_EVENT,
  listIntegrationConnections,
  listIntegrations,
  readPendingIntegration,
  rememberPendingIntegration,
  type IntegrationConnection,
  type IntegrationDefinition,
} from "@/lib/integrations";
import { activateAccountVault, endAccountVault } from "@/lib/db/database";
import { refreshAccount, type AuthSession } from "@/lib/sync";

const ACCOUNT_SESSION_MARKER = "chatsaver:account-session";

const SERVICE_ICONS = {
  googledrive: HardDrive,
  gmail: Mail,
  github: Code2,
  notion: Notebook,
  slack: MessageCircle,
  linkedin: UserCheck,
} as const;

const SERVICE_MARKS: Record<string, { label: string; className: string }> = {
  linkedin: { label: "in", className: "bg-[#0a66c2] text-white" },
  gmail: { label: "M", className: "bg-white text-[#d93025]" },
  googledrive: { label: "▲", className: "bg-white text-[#188038]" },
  github: { label: "GH", className: "bg-[#24292f] text-white" },
  notion: { label: "N", className: "bg-white text-black" },
  slack: { label: "#", className: "bg-[#4a154b] text-white" },
};

type MarketplaceFilter = "all" | "connected" | "available";

interface PendingConnection {
  toolkit: string;
  connectionId?: string;
}

interface ImportTarget {
  definition: IntegrationDefinition;
  connection: IntegrationConnection;
}

function isActive(connection: IntegrationConnection): boolean {
  return connection.status === "ACTIVE";
}

function statusLabel(status: string): string {
  if (status === "ACTIVE") return "Connected";
  if (status === "INITIALIZING" || status === "PENDING") return "Awaiting approval";
  if (status === "FAILED") return "Needs attention";
  if (status === "EXPIRED") return "Expired";
  return status.toLocaleLowerCase().replace(/_/g, " ");
}

export function IntegrationsMarketplace() {
  const [session, setSession] = useState<AuthSession>();
  const [sessionReady, setSessionReady] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [definitions, setDefinitions] = useState<IntegrationDefinition[]>([]);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<MarketplaceFilter>("all");
  const [expanded, setExpanded] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [pending, setPending] = useState<PendingConnection | undefined>(() => {
    const remembered = typeof window === "undefined" ? undefined : readPendingIntegration();
    return remembered ? { toolkit: remembered.toolkit, connectionId: remembered.connectionId } : undefined;
  });
  const [disconnectTarget, setDisconnectTarget] = useState<IntegrationConnection>();
  const [importTarget, setImportTarget] = useState<ImportTarget>();

  useEffect(() => {
    let hasSession = false;
    try {
      hasSession = localStorage.getItem(ACCOUNT_SESSION_MARKER) === "1";
    } catch {
      // Storage may be unavailable in privacy modes; sign-in remains available.
    }
    if (!hasSession) {
      const timer = window.setTimeout(() => setSessionReady(true), 0);
      return () => window.clearTimeout(timer);
    }

    let active = true;
    void refreshAccount()
      .then(async (restored) => {
        if (!active) return;
        await activateAccountVault(restored.user.id);
        if (!active) return;
        setSession(restored);
        return loadMarketplace(restored.accessToken);
      })
      .catch(() => {
        try { localStorage.removeItem(ACCOUNT_SESSION_MARKER); } catch { /* ignored */ }
      })
      .finally(() => {
        if (active) setSessionReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!pending || !session) return;
    let active = true;
    let checks = 0;
    const check = async () => {
      checks += 1;
      try {
        const next = await listIntegrationConnections(session.accessToken);
        if (!active) return;
        setConnections(next);
        const completed = next.some((connection) =>
          isActive(connection)
          && (pending.connectionId
            ? connection.id === pending.connectionId
            : connection.toolkit === pending.toolkit));
        if (completed) {
          setPending(undefined);
          toast.success("Integration connected", {
            description: "The authorized account is ready in ChatSaver.",
          });
        } else if (checks >= 30) {
          setPending(undefined);
        }
      } catch {
        if (checks >= 30 && active) setPending(undefined);
      }
    };
    const timer = window.setInterval(() => void check(), 3_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [pending, session]);

  useEffect(() => {
    if (!session) return;
    const refreshConnections = () => {
      void listIntegrationConnections(session.accessToken).then((next) => {
        setConnections(next);
        const remembered = readPendingIntegration();
        if (!remembered || next.some((connection) => isActive(connection) && (
          remembered.connectionId ? connection.id === remembered.connectionId : connection.toolkit === remembered.toolkit
        ))) setPending(undefined);
      }).catch(() => undefined);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === INTEGRATION_CONNECTED_EVENT) refreshConnections();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === INTEGRATION_CONNECTED_EVENT) refreshConnections();
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refreshConnections);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refreshConnections);
    };
  }, [session]);

  async function loadMarketplace(accessToken: string) {
    setLoading(true);
    setError(undefined);
    try {
      const available = await listIntegrations(accessToken);
      setDefinitions(available);
      if (available.some((integration) => integration.configured)) {
        try {
          setConnections(await listIntegrationConnections(accessToken));
        } catch (connectionError) {
          setError(connectionError instanceof Error
            ? connectionError.message
            : "Could not load connected accounts.");
        }
      } else {
        setConnections([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load integrations.");
    } finally {
      setLoading(false);
    }
  }

  async function connect(integration: IntegrationDefinition) {
    if (!session) {
      setAccountOpen(true);
      return;
    }
    setBusy(`connect:${integration.slug}`);
    try {
      const link = await createIntegrationConnectLink(session.accessToken, integration.slug);
      setPending({ toolkit: integration.slug, connectionId: link.connectionId });
      rememberPendingIntegration({ toolkit: integration.slug, connectionId: link.connectionId, startedAt: Date.now() });
      const authorizationWindow = window.open("about:blank", "chatsaver-integration", "popup");
      if (authorizationWindow) {
        authorizationWindow.location.assign(link.redirectUrl);
      } else {
        window.location.assign(link.redirectUrl);
      }
      toast.info("Secure authorization opened", {
        description: "Approve access there, then return here. Status refreshes automatically.",
      });
    } catch (connectError) {
      toast.error("Could not start connection", {
        description: connectError instanceof Error ? connectError.message : "Try again in a moment.",
      });
    } finally {
      setBusy(undefined);
    }
  }

  async function disconnect() {
    if (!session || !disconnectTarget) return;
    const target = disconnectTarget;
    setDisconnectTarget(undefined);
    setBusy(`disconnect:${target.id}`);
    try {
      await disconnectIntegration(session.accessToken, target.id);
      setConnections((current) => current.filter((connection) => connection.id !== target.id));
      toast.success("Integration disconnected", {
        description: "ChatSaver can no longer use that authorized account.",
      });
    } catch (disconnectError) {
      toast.error("Could not disconnect", {
        description: disconnectError instanceof Error ? disconnectError.message : "Try again in a moment.",
      });
    } finally {
      setBusy(undefined);
    }
  }

  const connectionMap = useMemo(() => {
    const grouped = new Map<string, IntegrationConnection[]>();
    for (const connection of connections) {
      const current = grouped.get(connection.toolkit) ?? [];
      current.push(connection);
      grouped.set(connection.toolkit, current);
    }
    return grouped;
  }, [connections]);

  const visibleDefinitions = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase();
    return definitions.filter((definition) => {
      const active = (connectionMap.get(definition.slug) ?? []).some(isActive);
      if (filter === "connected" && !active) return false;
      if (filter === "available" && active) return false;
      if (!normalizedQuery) return true;
      return `${definition.name} ${definition.category} ${definition.description}`
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
  }, [connectionMap, deferredQuery, definitions, filter]);

  const connectedCount = connections.filter(isActive).length;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="paint-backdrop" aria-hidden="true" />
      <div className="oil-grain" aria-hidden="true" />

      <header className="relative z-10 border-b border-white/8 bg-black/38 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 w-full max-w-[1480px] items-center gap-3 px-4 sm:px-6 lg:px-10">
          <Button asChild variant="ghost" size="icon-lg" aria-label="Back to ChatSaver">
            <Link href="/">
              <ArrowLeft />
            </Link>
          </Button>
          <Link className="flex items-center gap-2.5" href="/" aria-label="ChatSaver home">
            <Image src="/cs-transparent.png" alt="" width={36} height={36} className="size-9 object-cover" priority />
            <span>
              <span className="block text-sm font-semibold leading-none tracking-[-0.025em]">ChatSaver</span>
              <span className="mt-1 hidden font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground sm:block">
                Integration studio
              </span>
            </span>
          </Link>
          <div className="ms-auto flex items-center gap-2">
            {session ? (
              <Badge variant="outline" className="h-8 border-emerald-300/18 bg-emerald-300/6 px-3 text-[10px] text-emerald-100">
                {Array.from(new Set(connections.filter(isActive).map((connection) => connection.toolkit))).slice(0, 4).map((toolkit) => (
                  <IntegrationMark key={toolkit} toolkit={toolkit} compact />
                ))}
                {connectedCount === 0 ? <span className="size-1.5 rounded-full bg-white/30" /> : null}
                {connectedCount} connected
              </Badge>
            ) : (
              <Button variant="outline" className="border-white/10 bg-black/20" onClick={() => setAccountOpen(true)}>
                <ShieldCheck />
                Sign in
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 px-4 py-8 sm:px-6 sm:py-11 lg:px-10">
        <div className="mx-auto w-full max-w-[1320px]">
          <section className="grid gap-6 rounded-[1.75rem] border border-white/9 bg-black/38 p-5 shadow-[0_30px_100px_rgba(0,0,0,.42)] backdrop-blur-2xl sm:p-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:p-10">
            <div className="max-w-3xl">
              <div className="mb-5 flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.22em] text-white/50">
                <span className="grid size-8 place-items-center rounded-lg border border-primary/22 bg-primary/10 text-primary">
                  <Plug className="size-4" />
                </span>
                Connected workspace
              </div>
              <h1 className="text-balance text-[clamp(2.5rem,6vw,5.6rem)] font-semibold leading-[0.9] tracking-[-0.065em] text-ivory">
                Your tools, connected <span className="text-primary">with intent.</span>
              </h1>
              <p className="mt-5 max-w-2xl text-pretty text-sm leading-6 text-white/58 sm:text-base sm:leading-7">
                Authorize trusted services without sharing passwords with ChatSaver. Every action stays behind your account, a strict allowlist, and an explicit connection.
              </p>
            </div>
            <div className="grid content-start gap-3 rounded-2xl border border-white/8 bg-black/28 p-4 sm:p-5">
              <SecurityLine icon={Lock} title="Credentials stay isolated" detail="Composio stores and refreshes provider tokens." />
              <SecurityLine icon={UserCheck} title="Bound to your account" detail="Every connection is scoped to your ChatSaver UUID." />
              <SecurityLine icon={ShieldCheck} title="Approved actions only" detail="Imports stay read-only; scoped write actions require a separate confirmation." />
            </div>
          </section>

          {!sessionReady ? (
            <MarketplaceLoading />
          ) : !session ? (
            <section className="mx-auto my-12 max-w-xl rounded-2xl border border-white/9 bg-black/42 p-7 text-center backdrop-blur-2xl sm:p-9">
              <span className="mx-auto grid size-12 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                <Lock />
              </span>
              <h2 className="mt-5 text-xl font-semibold tracking-[-0.035em]">Sign in to manage integrations</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Connections belong to your ChatSaver account and never to a shared browser session.
              </p>
              <Button className="royal-glow mt-6 h-10 px-5" onClick={() => setAccountOpen(true)}>
                <ShieldCheck />
                Sign in / Sign up
              </Button>
            </section>
          ) : (
            <>
              <section className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/36" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search integrations"
                    aria-label="Search integrations"
                    className="h-10 border-white/9 bg-black/35 pl-9 backdrop-blur-xl"
                  />
                </div>
                <div className="grid grid-cols-3 rounded-xl border border-white/8 bg-black/30 p-1" aria-label="Filter integrations">
                  {(["all", "connected", "available"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={filter === value}
                      className={`rounded-lg px-3 py-2 text-[11px] font-medium capitalize transition-colors ${
                        filter === value ? "bg-primary text-white" : "text-white/50 hover:bg-white/5 hover:text-white"
                      }`}
                      onClick={() => setFilter(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </section>

              {error ? (
                <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-primary/22 bg-primary/8 px-4 py-3 text-sm text-red-100" role="alert">
                  <span>{error}</span>
                  <Button variant="ghost" size="sm" onClick={() => void loadMarketplace(session.accessToken)}>
                    <RefreshCw />
                    Retry
                  </Button>
                </div>
              ) : null}

              {loading ? (
                <MarketplaceLoading />
              ) : visibleDefinitions.length === 0 ? (
                <div className="my-14 rounded-2xl border border-dashed border-white/10 bg-black/20 p-10 text-center text-sm text-muted-foreground">
                  No integrations match this view.
                </div>
              ) : (
                <section
                  className="mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 md:grid md:grid-cols-2 md:overflow-visible md:pb-0 lg:grid-cols-3"
                  aria-label="Integration marketplace"
                >
                  {visibleDefinitions.map((definition) => {
                    const Icon = SERVICE_ICONS[definition.slug as keyof typeof SERVICE_ICONS] ?? Plug;
                    const serviceConnections = connectionMap.get(definition.slug) ?? [];
                    const activeConnections = serviceConnections.filter(isActive);
                    const supportsWrites = definition.actions.some((action) => !action.readOnly);
                    const isExpanded = expanded === definition.slug;
                    const isPending = pending?.toolkit === definition.slug;
                    return (
                      <Card key={definition.slug} className="min-w-[min(78vw,280px)] snap-start border border-white/8 bg-black/42 py-0 shadow-[0_22px_60px_rgba(0,0,0,.25)] backdrop-blur-xl transition-colors hover:border-white/14 md:min-w-0">
                        <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5">
                          <div className="mb-3 flex items-center gap-3 sm:mb-4">
                            <IntegrationMark toolkit={definition.slug} fallback={Icon} />
                            <Badge variant="outline" className="border-white/8 bg-black/25 font-mono text-[8px] uppercase tracking-[0.12em] text-white/45">
                              {definition.category}
                            </Badge>
                          </div>
                          <CardTitle className="text-lg tracking-[-0.035em]">{definition.name}</CardTitle>
                          <CardDescription className="hidden min-h-10 text-xs leading-5 text-white/48 sm:block">
                            {definition.description}
                          </CardDescription>
                          <CardAction>
                            {activeConnections.length > 0 ? (
                              <span className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-200">
                                <CheckCircle2 className="size-3.5" />
                                Connected
                              </span>
                            ) : null}
                          </CardAction>
                        </CardHeader>
                        <CardContent className="px-4 pb-4 sm:px-5 sm:pb-5">
                          <div className="hidden flex-wrap gap-1.5 sm:flex">
                            {definition.capabilities.map((capability) => (
                              <span key={capability} className="rounded-md border border-white/7 bg-white/[0.025] px-2 py-1 text-[9px] text-white/42">
                                {capability}
                              </span>
                            ))}
                          </div>

                          {activeConnections.length === 1 ? (
                            <Button
                              className="royal-glow mt-4 w-full"
                              onClick={() => setImportTarget({ definition, connection: activeConnections[0] })}
                            >
                              <FileDown />
                              Use integration
                            </Button>
                          ) : null}

                          {isExpanded ? (
                            <div className="mt-4 grid gap-2 border-t border-white/7 pt-4">
                              {serviceConnections.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No authorized account yet.</p>
                              ) : serviceConnections.map((connection) => {
                                return (
                                  <div key={connection.id} className="rounded-xl border border-white/8 bg-black/30 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="truncate text-xs font-medium">{connection.alias || definition.name}</p>
                                        <p className={`mt-1 text-[9px] ${isActive(connection) ? "text-emerald-200/70" : "text-amber-200/70"}`}>
                                          {statusLabel(connection.status)}
                                        </p>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`Disconnect ${definition.name}`}
                                        disabled={busy === `disconnect:${connection.id}`}
                                        onClick={() => setDisconnectTarget(connection)}
                                      >
                                        {busy === `disconnect:${connection.id}` ? <LoaderCircle className="animate-spin" /> : <Unplug />}
                                      </Button>
                                    </div>
                                    {isActive(connection) ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="mt-3 w-full border-white/8 bg-white/[0.025]"
                                        onClick={() => setImportTarget({ definition, connection })}
                                      >
                                        <FileDown />
                                        Use integration
                                        <span className="ms-auto font-mono text-[7px] text-emerald-200/60">{supportsWrites ? "ACTION HUB" : "READ ONLY"}</span>
                                      </Button>
                                    ) : null}
                                  </div>
                                );
                              })}
                              {definition.configured ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={busy === `connect:${definition.slug}` || isPending}
                                  onClick={() => void connect(definition)}
                                >
                                  <Plug />
                                  Connect another account
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                        </CardContent>
                        <CardFooter className="mt-auto gap-2 border-white/7 bg-white/[0.018] px-4 py-3 sm:px-5 sm:py-3.5">
                          {activeConnections.length > 0 || serviceConnections.length > 0 ? (
                            <>
                              <Button variant="outline" className="flex-1 border-white/9 bg-black/20" onClick={() => setExpanded(isExpanded ? undefined : definition.slug)}>
                                {isExpanded ? "Close" : "Manage"}
                              </Button>
                              {activeConnections.length === 1 ? (
                                <Button
                                  variant="destructive"
                                  aria-label={`Disconnect ${definition.name}`}
                                  onClick={() => setDisconnectTarget(activeConnections[0])}
                                >
                                  <Unplug />
                                  <span className="hidden sm:inline">Disconnect</span>
                                </Button>
                              ) : null}
                            </>
                          ) : (
                            <Button
                              className="royal-glow w-full"
                              disabled={!definition.configured || busy === `connect:${definition.slug}` || isPending}
                              title={definition.configured ? undefined : "Configure Composio on the ChatSaver server first"}
                              onClick={() => void connect(definition)}
                            >
                              {busy === `connect:${definition.slug}` || isPending ? <LoaderCircle className="animate-spin" /> : <Plug />}
                              {isPending ? "Awaiting approval" : definition.configured ? "Connect" : "Not configured"}
                            </Button>
                          )}
                        </CardFooter>
                      </Card>
                    );
                  })}
                </section>
              )}
            </>
          )}
        </div>
      </main>

      <SiteFooter compact />

      <AccountDialog
        open={accountOpen}
        session={session}
        syncing={false}
        onOpenChange={setAccountOpen}
        onAuthenticated={(authenticated) => {
          try { localStorage.setItem(ACCOUNT_SESSION_MARKER, "1"); } catch { /* ignored */ }
          void activateAccountVault(authenticated.user.id, true).then(({ importedNotes }) => {
            setSession(authenticated);
            setAccountOpen(false);
            if (importedNotes > 0) {
              toast.success("Offline notes added to your account", {
                description: `${importedNotes} local ${importedNotes === 1 ? "note is" : "notes are"} safe and ready to sync.`,
              });
            }
            void loadMarketplace(authenticated.accessToken);
          });
        }}
        onLoggedOut={() => {
          try { localStorage.removeItem(ACCOUNT_SESSION_MARKER); } catch { /* ignored */ }
          endAccountVault();
          setSession(undefined);
          setDefinitions([]);
          setConnections([]);
        }}
        onSync={() => undefined}
      />

      {importTarget && session ? (
        <IntegrationImportDialog
          definition={importTarget.definition}
          connection={importTarget.connection}
          session={session}
          onClose={() => setImportTarget(undefined)}
        />
      ) : null}

      <AlertDialog open={Boolean(disconnectTarget)} onOpenChange={(open) => !open && setDisconnectTarget(undefined)}>
        <AlertDialogContent className="border-white/10 bg-[#120b0d]/98">
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect this account?</AlertDialogTitle>
            <AlertDialogDescription>
              ChatSaver will remove this authorization. Your data in the external service is not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep connected</AlertDialogCancel>
            <AlertDialogAction onClick={() => void disconnect()}>Disconnect</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SecurityLine({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Lock;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-white/7 bg-white/[0.025] p-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div>
        <p className="text-xs font-medium text-white/88">{title}</p>
        <p className="mt-1 text-[10px] leading-4 text-white/42">{detail}</p>
      </div>
    </div>
  );
}

function MarketplaceLoading() {
  return (
    <div className="my-12 flex gap-3 overflow-hidden md:grid md:grid-cols-2 lg:grid-cols-3" aria-label="Loading integrations">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-64 animate-pulse rounded-2xl border border-white/7 bg-black/30" />
      ))}
    </div>
  );
}

function IntegrationMark({
  toolkit,
  compact = false,
  fallback: Fallback = Plug,
}: {
  toolkit: string;
  compact?: boolean;
  fallback?: typeof Plug;
}) {
  const mark = SERVICE_MARKS[toolkit];
  const size = compact ? "size-5 rounded-md text-[8px]" : "size-11 rounded-xl text-sm";
  return (
    <span
      className={`grid shrink-0 place-items-center border border-white/12 font-bold shadow-inner ${size} ${mark?.className ?? "bg-white/[0.045] text-ivory"}`}
      aria-label={mark ? `${toolkit} logo` : undefined}
    >
      {mark ? mark.label : <Fallback className={compact ? "size-3" : "size-5"} />}
    </span>
  );
}
