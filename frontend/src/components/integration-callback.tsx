"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, LoaderCircle, Lock, Plug, TriangleAlert } from "lucide-react";
import { AccountDialog } from "@/components/account-dialog";
import { Button } from "@/components/ui/button";
import {
  announceIntegrationConnected,
  completeIntegrationAuthentication,
  listIntegrationConnections,
  readPendingIntegration,
} from "@/lib/integrations";
import { refreshAccount, type AuthSession } from "@/lib/sync";

const ACCOUNT_SESSION_MARKER = "chatsaver:account-session";

type CallbackState =
  | { status: "restoring" }
  | { status: "sign-in" }
  | { status: "completing" }
  | { status: "complete"; toolkit: string }
  | { status: "error"; message: string };

export function IntegrationCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionUri = searchParams.get("session_uri");
  const [session, setSession] = useState<AuthSession>();
  const [accountOpen, setAccountOpen] = useState(false);
  const [state, setState] = useState<CallbackState>({ status: "restoring" });
  const completionStarted = useRef(false);

  const finish = useCallback(async (currentSession: AuthSession) => {
    if (completionStarted.current) return;
    completionStarted.current = true;
    setState({ status: "completing" });
    try {
      let completed: { connectionId: string; toolkit: string };
      if (sessionUri) {
        completed = await completeIntegrationAuthentication(currentSession.accessToken, sessionUri);
      } else {
        const pending = readPendingIntegration();
        const callbackConnectionId = searchParams.get("connected_account_id") ?? searchParams.get("connection_id") ?? undefined;
        const expectedId = callbackConnectionId ?? pending?.connectionId;
        const expectedToolkit = pending?.toolkit;
        let connected;
        for (let attempt = 0; attempt < 12 && !connected; attempt += 1) {
          const connections = await listIntegrationConnections(currentSession.accessToken);
          connected = connections.find((connection) => connection.status === "ACTIVE" && (
            expectedId ? connection.id === expectedId : expectedToolkit ? connection.toolkit === expectedToolkit : false
          ));
          if (!connected && attempt < 11) await new Promise((resolve) => window.setTimeout(resolve, 500));
        }
        if (!connected) throw new Error("The provider finished, but ChatSaver could not verify the connected account yet. Return and refresh once.");
        completed = { connectionId: connected.id, toolkit: connected.toolkit };
      }
      announceIntegrationConnected(completed.connectionId, completed.toolkit);
      setState({ status: "complete", toolkit: completed.toolkit });
      window.setTimeout(() => {
        if (window.opener && !window.opener.closed) {
          window.opener.focus();
          window.close();
        }
        router.replace("/integrations");
      }, 900);
    } catch (error) {
      completionStarted.current = false;
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "The integration could not be confirmed.",
      });
    }
  }, [router, searchParams, sessionUri]);

  useEffect(() => {
    let hasSession = false;
    try {
      hasSession = localStorage.getItem(ACCOUNT_SESSION_MARKER) === "1";
    } catch {
      // A user can still sign in explicitly when storage is unavailable.
    }
    if (!hasSession) {
      const timer = window.setTimeout(() => setState({ status: "sign-in" }), 0);
      return () => window.clearTimeout(timer);
    }

    let active = true;
    void refreshAccount()
      .then((restored) => {
        if (!active) return;
        setSession(restored);
        return finish(restored);
      })
      .catch(() => {
        if (active) setState({ status: "sign-in" });
      });
    return () => {
      active = false;
    };
  }, [finish, sessionUri]);

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div className="paint-backdrop paint-backdrop-forward" aria-hidden="true" />
      <div className="oil-grain" aria-hidden="true" />
      <div className="first-run-vignette" aria-hidden="true" />

      <main className="relative z-10 w-full max-w-lg rounded-[1.75rem] border border-white/10 bg-black/65 p-6 text-center shadow-[0_35px_110px_rgba(0,0,0,.62)] backdrop-blur-2xl sm:p-9">
        <Link className="mx-auto inline-flex items-center gap-2.5" href="/" aria-label="ChatSaver home">
          <Image src="/cs-transparent.png" alt="" width={42} height={42} className="size-10 object-cover" priority />
          <span className="text-sm font-semibold">ChatSaver</span>
        </Link>

        <span className={`mx-auto mt-8 grid size-14 place-items-center rounded-2xl border ${
          state.status === "complete"
            ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
            : state.status === "error"
              ? "border-red-300/20 bg-red-300/8 text-red-200"
              : "border-primary/25 bg-primary/10 text-primary"
        }`}>
          {state.status === "complete" ? <CheckCircle2 />
            : state.status === "error" ? <TriangleAlert />
              : state.status === "sign-in" ? <Lock />
                : <LoaderCircle className="animate-spin" />}
        </span>

        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.045em]">
          {state.status === "restoring" ? "Restoring your session"
            : state.status === "sign-in" ? "Confirm it’s you"
              : state.status === "completing" ? "Securing your connection"
                : state.status === "complete" ? "Integration connected"
                  : "Connection not completed"}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-white/50">
          {state.status === "restoring" ? "Checking the signed-in ChatSaver account before authorization continues."
            : state.status === "sign-in" ? "Sign in to the same ChatSaver account that started this authorization."
            : state.status === "completing" ? "Verifying the authorized account and matching it to your private ChatSaver user ID."
                : state.status === "complete" ? `${state.toolkit} is ready. This window will close automatically…`
                  : state.message}
        </p>

        {state.status === "sign-in" ? (
          <Button className="royal-glow mt-6 h-10 px-5" onClick={() => setAccountOpen(true)}>
            <Lock />
            Sign in to confirm
          </Button>
        ) : state.status === "error" ? (
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            {session ? (
              <Button onClick={() => void finish(session)}>
                <Plug />
                Try again
              </Button>
            ) : null}
            <Button asChild variant="outline" className="border-white/10 bg-black/20">
              <Link href="/integrations">
                Return to integrations
                <ArrowRight />
              </Link>
            </Button>
          </div>
        ) : null}

        <p className="mt-8 font-mono text-[8px] uppercase tracking-[0.18em] text-white/28">
          No provider credentials pass through this page
        </p>
      </main>

      <AccountDialog
        open={accountOpen}
        session={session}
        syncing={false}
        onOpenChange={setAccountOpen}
        onAuthenticated={(authenticated) => {
          try { localStorage.setItem(ACCOUNT_SESSION_MARKER, "1"); } catch { /* ignored */ }
          setSession(authenticated);
          setAccountOpen(false);
          void finish(authenticated);
        }}
        onLoggedOut={() => {
          try { localStorage.removeItem(ACCOUNT_SESSION_MARKER); } catch { /* ignored */ }
          setSession(undefined);
          setState({ status: "sign-in" });
        }}
        onSync={() => undefined}
      />
    </div>
  );
}
