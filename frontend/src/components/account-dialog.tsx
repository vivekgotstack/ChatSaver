"use client";

import { FormEvent, useEffect, useState } from "react";
import { Cloud, Copy, Download, FileDown, LoaderCircle, LogOut, MailCheck, MonitorSmartphone, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AuthSession, DeviceSummary } from "@/lib/sync";
import { listAccountDevices, loginAccount, logoutAccount, requestPasswordReset, requestRegistration, revokeAccountDevice, verifyPasswordReset, verifyRegistration } from "@/lib/sync";

interface AccountDialogProps {
  open: boolean;
  session?: AuthSession;
  syncing: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthenticated: (session: AuthSession) => void;
  onLoggedOut: () => void;
  onSync: () => void;
  onConvertToPdf?: () => void;
}

export function AccountDialog({ open, session, syncing, onOpenChange, onAuthenticated, onLoggedOut, onSync, onConvertToPdf }: AccountDialogProps) {
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [devicesBusy, setDevicesBusy] = useState(false);
  const [devicesError, setDevicesError] = useState<string>();
  const [confirmDeviceId, setConfirmDeviceId] = useState<string>();
  const [removingDeviceId, setRemovingDeviceId] = useState<string>();

  useEffect(() => {
    if (!open || !session) return;
    let active = true;
    setDevicesBusy(true);
    setDevicesError(undefined);
    void listAccountDevices(session.accessToken)
      .then((items) => {
        if (active) setDevices(items);
      })
      .catch((error: unknown) => {
        if (active) {
          setDevicesError(error instanceof Error ? error.message : "Could not load your devices.");
        }
      })
      .finally(() => {
        if (active) setDevicesBusy(false);
      });
    return () => {
      active = false;
    };
  }, [open, session]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "reset") {
        if (!awaitingCode) {
          await requestPasswordReset({ email, password });
          setAwaitingCode(true);
          toast.success("Reset code requested", { description: `If ${email.trim()} has an account, a six-digit code is on its way.` });
          return;
        }
        await verifyPasswordReset({ email, code: verificationCode });
        const nextSession = await loginAccount({ email, password });
        onAuthenticated(nextSession);
        toast.success("Password reset", { description: "Previous sessions were signed out and this device is connected." });
        return;
      }
      if (mode === "register" && !awaitingCode) {
        await requestRegistration({ email, password, displayName });
        setAwaitingCode(true);
        toast.success("Verification code sent", { description: `Check ${email.trim()} to finish creating your account.` });
        return;
      }
      const nextSession = mode === "register"
        ? await verifyRegistration({ email, code: verificationCode })
        : await loginAccount({ email, password });
      onAuthenticated(nextSession);
      toast.success(mode === "register" ? "Email verified — account created" : "Welcome back", {
        description: "Your local vault is syncing with PostgreSQL.",
      });
    } catch (error) {
      toast.error(mode === "register" ? "Could not verify signup" : mode === "reset" ? "Could not reset password" : "Could not sign in", {
        description: error instanceof Error ? error.message : "Please check the API and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await logoutAccount();
      onLoggedOut();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  async function removeDevice(deviceId: string) {
    if (!session) return;
    setRemovingDeviceId(deviceId);
    try {
      await revokeAccountDevice(session.accessToken, deviceId);
      setDevices((items) => items.filter((device) => device.id !== deviceId));
      setConfirmDeviceId(undefined);
      toast.success("Device removed", {
        description: "Its refresh sessions were revoked and it can no longer sync this account.",
      });
    } catch (error) {
      toast.error("Could not remove device", {
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setRemovingDeviceId(undefined);
    }
  }

  function selectMode(nextMode: "login" | "register" | "reset") {
    setMode(nextMode);
    setAwaitingCode(false);
    setVerificationCode("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] overflow-x-hidden overflow-y-auto overscroll-contain border-white/10 bg-[#0b090a]/96 p-0 shadow-[0_28px_90px_rgba(0,0,0,.58),0_0_70px_oklch(0.48_0.2_24/.12)] sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-[440px]">
        <div className="h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
        <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6">
          <div className="mb-1 grid size-10 place-items-center rounded-xl border border-primary/25 bg-primary/12 text-primary shadow-[0_12px_34px_oklch(0.5_0.22_24/.18)] sm:mb-2 sm:size-11 sm:rounded-2xl">
            {session ? <ShieldCheck /> : awaitingCode ? <MailCheck /> : <Cloud />}
          </div>
          <DialogTitle className="pe-7 text-xl tracking-[-0.04em] sm:text-[1.35rem]">
            {session ? "Your synced vault" : mode === "reset" ? awaitingCode ? "Enter your reset code" : "Reset your password" : mode === "register" ? awaitingCode ? "Check your email" : "Take your library anywhere" : "Welcome back to your vault"}
          </DialogTitle>
          <DialogDescription className="max-w-sm text-xs leading-relaxed sm:text-sm">
            {session
              ? `Signed in as ${session.user.email}. Your IndexedDB vault remains the fast local source.`
              : mode === "reset"
                ? awaitingCode ? `Enter the six-digit code sent to ${email.trim()}.` : "Choose a new password and verify ownership by email."
              : mode === "register"
                ? awaitingCode ? `We sent a six-digit verification code to ${email.trim()}.` : "Verify your email to create your PostgreSQL cloud vault."
                : "Sign in to restore and sync your library. Your local vault stays available without an account."}
          </DialogDescription>
        </DialogHeader>

        {session ? (
          <div className="mx-4 mb-4 space-y-3 sm:mx-6 sm:mb-6">
            <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
              <p className="text-sm font-medium">{session.user.displayName || session.user.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">{session.user.email}</p>
              <div className="mt-4 flex gap-2">
                <Button className="flex-1" onClick={onSync} disabled={syncing}>{syncing ? <LoaderCircle className="animate-spin" /> : <Cloud />}{syncing ? "Syncing…" : "Sync now"}</Button>
                <Button variant="outline" onClick={() => void logout()} disabled={busy}><LogOut />Sign out</Button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-black/20 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold">All devices</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Review every device allowed to sync this vault.</p>
                </div>
                <span className="rounded-full border border-white/8 bg-white/[0.035] px-2 py-1 font-mono text-[8px] uppercase tracking-wide text-muted-foreground">
                  {devices.length} active
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {devicesBusy ? (
                  <div className="flex items-center gap-2 rounded-xl border border-white/6 px-3 py-3 text-[11px] text-muted-foreground">
                    <LoaderCircle className="size-3.5 animate-spin text-primary" />Loading devices…
                  </div>
                ) : devicesError ? (
                  <p className="rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2.5 text-[10px] text-destructive">{devicesError}</p>
                ) : devices.map((device) => (
                  <div key={device.id} className="rounded-xl border border-white/7 bg-white/[0.025] px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/8 bg-black/20 text-primary">
                        <MonitorSmartphone className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[11px] font-medium">{device.name}</p>
                          {device.current ? <span className="rounded-full bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-wide text-emerald-300">This device</span> : null}
                        </div>
                        <p className="mt-0.5 text-[9px] text-muted-foreground">
                          {device.lastSeenAt ? `Seen ${new Date(device.lastSeenAt).toLocaleString()}` : "Not synced yet"}
                        </p>
                      </div>
                      {!device.current && confirmDeviceId !== device.id ? (
                        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${device.name}`} onClick={() => setConfirmDeviceId(device.id)}>
                          <Trash2 className="text-destructive" />
                        </Button>
                      ) : null}
                    </div>
                    {confirmDeviceId === device.id ? (
                      <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/6 pt-2">
                        <p className="text-[9px] text-muted-foreground">Remove this device and revoke its sessions?</p>
                        <div className="flex gap-1.5">
                          <Button size="xs" variant="ghost" onClick={() => setConfirmDeviceId(undefined)}>Cancel</Button>
                          <Button size="xs" variant="destructive" disabled={removingDeviceId === device.id} onClick={() => void removeDevice(device.id)}>
                            {removingDeviceId === device.id ? <LoaderCircle className="animate-spin" /> : <Trash2 />}Remove
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
                {!devicesBusy && !devicesError && devices.length === 0 ? (
                  <p className="rounded-xl border border-white/6 px-3 py-3 text-[10px] text-muted-foreground">No active devices were found.</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <form className="space-y-3 px-4 pb-4 sm:space-y-4 sm:px-6 sm:pb-6" onSubmit={submit}>
            <div className="grid grid-cols-2 rounded-xl border border-white/8 bg-black/25 p-1">
              <Button type="button" size="sm" variant={mode === "login" ? "secondary" : "ghost"} aria-pressed={mode === "login"} onClick={() => selectMode("login")}>Sign in</Button>
              <Button type="button" size="sm" variant={mode === "register" ? "secondary" : "ghost"} aria-pressed={mode === "register"} onClick={() => selectMode("register")}>Sign up</Button>
            </div>
            {mode === "register" && !awaitingCode ? <label className="grid gap-1.5 text-xs text-muted-foreground">Display name<Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={160} placeholder="Vivek" /></label> : null}
            {!awaitingCode ? (
              <>
                <label className="grid gap-1.5 text-xs text-muted-foreground">Email<Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="you@example.com" /></label>
                <label className="grid gap-1.5 text-xs text-muted-foreground">{mode === "reset" ? "New password" : "Password"}<Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "login" ? undefined : 12} maxLength={72} placeholder={mode === "login" ? "Your password" : "At least 12 characters"} /></label>
                {mode === "login" ? <Button type="button" variant="ghost" size="sm" className="h-9 w-full rounded-lg border border-white/8 bg-white/[0.025] text-xs text-muted-foreground hover:bg-white/[0.05] hover:text-foreground" onClick={() => selectMode("reset")}>Forgot password? Reset it</Button> : null}
              </>
            ) : (
              <label className="grid gap-1.5 text-xs text-muted-foreground">Verification code<Input className="h-12 text-center font-mono text-xl tracking-[0.35em]" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6} placeholder="000000" autoFocus /></label>
            )}
            <Button className="royal-glow h-10 w-full" type="submit" disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : awaitingCode ? <MailCheck /> : <Cloud />}
              {busy ? "Connecting…" : mode === "reset" ? awaitingCode ? "Reset password and sign in" : "Email me a reset code" : mode === "register" ? awaitingCode ? "Verify and create account" : "Email me a code" : "Sign in and restore"}
            </Button>
            {awaitingCode ? <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => { setAwaitingCode(false); setVerificationCode(""); }}>Change email or resend code</Button> : null}
            <div className="rounded-xl border border-white/7 bg-white/[0.025] px-3.5 py-2.5 sm:py-3">
              <p className="text-[11px] font-medium text-foreground">No account required</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Download className="size-3 text-primary" />Download .md</span>
                <span className="inline-flex items-center gap-1.5"><Copy className="size-3 text-primary" />Copy as text</span>
                {onConvertToPdf ? (
                  <button type="button" className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground" onClick={() => {
                    onOpenChange(false);
                    window.setTimeout(onConvertToPdf, 0);
                  }}><FileDown className="size-3 text-primary" />Convert to PDF</button>
                ) : null}
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
