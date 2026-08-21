"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileKey2,
  KeyRound,
  Link2,
  LockKeyhole,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  PRIVATE_VAULT_DISMISSED_KEY,
  createPrivateVault,
  createPrivateVaultBackup,
  deletePrivateVaultItem,
  hasPrivateVault,
  listPrivateVaultItems,
  resetPrivateVault,
  restorePrivateVaultBackup,
  savePrivateVaultItem,
  unlockPrivateVault,
  type PrivateVaultItem,
} from "@/lib/private-vault";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type VaultPhase = "loading" | "intro" | "setup" | "locked" | "unlocked";

function PinInput({
  value,
  onChange,
  label,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className="relative block">
        <Input
          autoFocus={autoFocus}
          type={visible ? "text" : "password"}
          inputMode="numeric"
          autoComplete="off"
          aria-label={label}
          className="h-12 pe-12 text-center font-mono text-xl tracking-[0.55em]"
          maxLength={6}
          placeholder="••••••"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute end-2 top-1/2 -translate-y-1/2"
          aria-label={visible ? "Hide PIN" : "Show PIN"}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </Button>
      </span>
    </label>
  );
}

function ItemDialog({
  open,
  item,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  item?: PrivateVaultItem;
  onOpenChange: (open: boolean) => void;
  onSave: (input: Pick<PrivateVaultItem, "title" | "link" | "description" | "pinned">) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [description, setDescription] = useState("");
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? "");
    setLink(item?.link ?? "");
    setDescription(item?.description ?? "");
    setPinned(item?.pinned ?? false);
  }, [item, open]);

  async function save() {
    setSaving(true);
    try {
      await onSave({ title, link, description, pinned });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "This private item could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-lg border-white/10 bg-card/96">
        <DialogHeader>
          <DialogTitle>{item ? "Edit private item" : "Quick-save something private"}</DialogTitle>
          <DialogDescription>
            The title, link, and description are encrypted before they enter local storage.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted-foreground">Title</span>
            <Input autoFocus maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Important resource" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted-foreground">Link</span>
            <Input inputMode="url" maxLength={2048} value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://example.com" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted-foreground">Description</span>
            <Textarea className="min-h-28 resize-y" maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Why this matters, access details, or a quick reminder…" />
          </label>
          <button
            type="button"
            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-start text-sm transition-colors ${pinned ? "border-primary/30 bg-primary/10 text-foreground" : "border-white/8 bg-black/15 text-muted-foreground hover:text-foreground"}`}
            onClick={() => setPinned((current) => !current)}
          >
            {pinned ? <Pin className="text-primary" /> : <PinOff />}
            <span>
              <span className="block font-medium">{pinned ? "Pinned to the top" : "Pin this item"}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Pinned items remain above recent items.</span>
            </span>
          </button>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving ? "Encrypting…" : item ? "Save changes" : "Encrypt & save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PrivateVaultApp() {
  const router = useRouter();
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<VaultPhase>("loading");
  const [vaultKey, setVaultKey] = useState<CryptoKey>();
  const [items, setItems] = useState<PrivateVaultItem[]>([]);
  const [query, setQuery] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [itemEditor, setItemEditor] = useState<PrivateVaultItem | null | undefined>();
  const lockForSecurity = useEffectEvent(() => lock());

  useEffect(() => {
    let active = true;
    void hasPrivateVault().then((configured) => {
      if (active) setPhase(configured ? "locked" : "intro");
    }).catch(() => {
      if (active) setPhase("intro");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!vaultKey) return;
    let timer = window.setTimeout(lockForSecurity, 5 * 60_000);
    const renew = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lockForSecurity, 5 * 60_000);
    };
    const hide = () => {
      if (document.visibilityState === "hidden") lockForSecurity();
    };
    window.addEventListener("pointerdown", renew, { passive: true });
    window.addEventListener("keydown", renew);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", renew);
      window.removeEventListener("keydown", renew);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [vaultKey]);

  useEffect(() => {
    if (!lockUntil) return;
    const timer = window.setTimeout(
      () => setLockUntil(0),
      Math.max(0, lockUntil - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [lockUntil]);

  function lock() {
    setVaultKey(undefined);
    setItems([]);
    setPin("");
    setItemEditor(undefined);
    setPhase("locked");
  }

  async function loadItems(key: CryptoKey) {
    setItems(await listPrivateVaultItems(key));
  }

  async function configure() {
    if (pin.length !== 6) {
      toast.error("Choose a six-digit PIN.");
      return;
    }
    if (pin !== confirmPin) {
      toast.error("The PIN confirmation does not match.");
      return;
    }
    const key = await createPrivateVault(pin);
    setVaultKey(key);
    setPin("");
    setConfirmPin("");
    setItems([]);
    setPhase("unlocked");
    toast.success("Private Vault enabled", { description: "Your PIN stays only in your memory." });
  }

  async function unlock() {
    if (pin.length !== 6 || Date.now() < lockUntil) return;
    try {
      const key = await unlockPrivateVault(pin);
      await loadItems(key);
      setVaultKey(key);
      setPin("");
      setFailedAttempts(0);
      setLockUntil(0);
      setPhase("unlocked");
    } catch (error) {
      const attempts = failedAttempts + 1;
      setFailedAttempts(attempts);
      setPin("");
      if (attempts >= 5) {
        setLockUntil(Date.now() + 30_000);
        setFailedAttempts(0);
        toast.error("Too many attempts. Try again in 30 seconds.");
      } else {
        toast.error(error instanceof Error ? error.message : "That PIN is not correct.");
      }
    }
  }

  async function saveItem(input: Pick<PrivateVaultItem, "title" | "link" | "description" | "pinned">) {
    if (!vaultKey) throw new Error("Private Vault is locked.");
    await savePrivateVaultItem(vaultKey, input, itemEditor ?? undefined);
    await loadItems(vaultKey);
    toast.success(itemEditor ? "Private item updated" : "Saved in Private Vault");
  }

  async function togglePinned(item: PrivateVaultItem) {
    if (!vaultKey) return;
    await savePrivateVaultItem(vaultKey, { ...item, pinned: !item.pinned }, item);
    await loadItems(vaultKey);
  }

  async function exportBackup() {
    const content = await createPrivateVaultBackup();
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ChatSaver-Private-Vault-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Encrypted Private Vault backup downloaded");
  }

  async function restoreBackup(file: File) {
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Private Vault backups must be smaller than 25 MB.");
      return;
    }
    try {
      const count = await restorePrivateVaultBackup(JSON.parse(await file.text()) as unknown);
      setPhase("locked");
      toast.success(`Encrypted vault restored`, { description: `${count} item${count === 1 ? "" : "s"} ready to unlock with its original PIN.` });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The encrypted backup could not be restored.");
    } finally {
      if (restoreInputRef.current) restoreInputRef.current.value = "";
    }
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleItems = normalizedQuery
    ? items.filter((item) => `${item.title}\n${item.link}\n${item.description}`.toLocaleLowerCase().includes(normalizedQuery))
    : items;

  return (
    <main className="relative min-h-dvh overflow-hidden p-0 lg:p-3">
      <div className="paint-backdrop" aria-hidden="true" />
      <div className="oil-grain" aria-hidden="true" />
      <div className="app-surface relative z-10 min-h-dvh border-white/8 lg:min-h-[calc(100dvh-1.5rem)] lg:rounded-[1.75rem] lg:border">
        <header className="sticky top-0 z-20 flex h-16 items-center border-b border-white/8 bg-black/50 px-3 backdrop-blur-2xl sm:px-5">
          <Button asChild variant="ghost" size="icon-lg">
            <Link href="/" aria-label="Return to ChatSaver"><ArrowLeft /></Link>
          </Button>
          <Link className="ms-1 flex items-center gap-2.5" href="/" aria-label="ChatSaver home">
            <Image src="/cs-transparent.png" alt="" width={34} height={34} className="size-8 object-cover" priority />
            <span className="hidden text-sm font-semibold tracking-[-0.025em] sm:block">ChatSaver</span>
          </Link>
          <div className="mx-3 h-6 w-px bg-white/8" />
          <div className="flex min-w-0 items-center gap-2">
            <LockKeyhole className="size-4 text-primary" />
            <span className="truncate text-sm font-medium">Private Vault</span>
            <Badge variant="outline" className="hidden border-primary/25 bg-primary/8 sm:inline-flex">Local encrypted</Badge>
          </div>
          {phase === "unlocked" ? (
            <div className="ms-auto flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild><Button variant="ghost" size="icon-lg" aria-label="Download encrypted backup" onClick={() => void exportBackup()}><Download /></Button></TooltipTrigger>
                <TooltipContent>Encrypted backup</TooltipContent>
              </Tooltip>
              <Button variant="outline" className="gap-2" onClick={lock}><LockKeyhole /><span className="hidden sm:inline">Lock now</span></Button>
            </div>
          ) : null}
        </header>

        {phase === "loading" ? (
          <div className="grid min-h-[calc(100dvh-4rem)] place-items-center"><ShieldCheck className="size-8 animate-pulse text-primary" /></div>
        ) : null}

        {phase === "intro" ? (
          <section className="mx-auto grid min-h-[calc(100dvh-4rem)] w-full max-w-6xl items-center gap-10 px-5 py-12 lg:grid-cols-[1.05fr_.95fr] lg:px-10">
            <div>
              <Badge variant="outline" className="border-primary/30 bg-primary/10"><FileKey2 /> Optional private space</Badge>
              <h1 className="mt-6 max-w-2xl text-balance text-4xl font-semibold leading-[0.95] tracking-[-0.055em] sm:text-6xl">Quick links.<br /><span className="text-ivory/68">Locked away locally.</span></h1>
              <p className="mt-6 max-w-xl text-pretty text-sm leading-7 text-muted-foreground sm:text-base">
                Private Vault is a focused place for important links and short descriptions. Every title, URL, and note is encrypted on this device before it is saved.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" className="royal-glow gap-2" onClick={() => setPhase("setup")}><KeyRound />Enable Private Vault</Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => {
                    try { localStorage.setItem(PRIVATE_VAULT_DISMISSED_KEY, "1"); } catch { /* ignored */ }
                    router.push("/");
                  }}
                >Not now</Button>
              </div>
              <button className="mt-5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" type="button" onClick={() => restoreInputRef.current?.click()}>
                Restore an encrypted Private Vault backup
              </button>
            </div>
            <div className="relative rounded-[2rem] border border-primary/35 bg-primary/[0.055] p-2 shadow-[0_0_80px_rgba(219,0,44,.12)] ring-4 ring-primary/5 motion-safe:animate-pulse">
              <div className="rounded-[1.55rem] border border-white/8 bg-black/55 p-6 motion-safe:animate-none sm:p-8">
                <div className="flex items-center justify-between"><span className="grid size-11 place-items-center rounded-xl bg-primary/14 text-primary"><LockKeyhole /></span><Badge variant="secondary">First-time setup</Badge></div>
                <h2 className="mt-7 text-2xl font-semibold tracking-[-0.04em]">What enabling does</h2>
                <div className="mt-5 space-y-4">
                  {["Creates a separate encrypted local database", "Protects it with your six-digit PIN", "Auto-locks when hidden or after five minutes", "Keeps private data out of account sync"].map((item) => (
                    <div className="flex gap-3 text-sm text-muted-foreground" key={item}><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-300/10 text-emerald-300"><Check className="size-3" /></span>{item}</div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {phase === "setup" ? (
          <section className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-lg place-items-center px-5 py-12">
            <Card className="w-full border-primary/30 bg-card/90 shadow-[0_0_90px_rgba(219,0,44,.12)] ring-4 ring-primary/5">
              <CardContent className="p-6 sm:p-8">
                <span className="grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary"><KeyRound /></span>
                <h1 className="mt-6 text-3xl font-semibold tracking-[-0.045em]">Set your six-digit PIN</h1>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">There is no PIN recovery. Use a memorable PIN that is different from your phone unlock code.</p>
                <div className="mt-7 space-y-5">
                  <PinInput autoFocus label="New PIN" value={pin} onChange={setPin} />
                  <PinInput label="Confirm PIN" value={confirmPin} onChange={setConfirmPin} />
                </div>
                <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="ghost" onClick={() => { setPin(""); setConfirmPin(""); setPhase("intro"); }}>Back</Button>
                  <Button disabled={pin.length !== 6 || confirmPin.length !== 6} onClick={() => void configure()}><ShieldCheck />Create encrypted vault</Button>
                </div>
              </CardContent>
            </Card>
          </section>
        ) : null}

        {phase === "locked" ? (
          <section className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-md place-items-center px-5 py-12">
            <Card className="w-full border-white/10 bg-card/90">
              <CardContent className="p-6 text-center sm:p-8">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"><LockKeyhole /></span>
                <h1 className="mt-6 text-3xl font-semibold tracking-[-0.045em]">Private Vault locked</h1>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">Enter your PIN. The derived key exists only while this screen remains unlocked.</p>
                <form className="mt-7 space-y-5" onSubmit={(event) => { event.preventDefault(); void unlock(); }}>
                  <PinInput autoFocus label="Six-digit PIN" value={pin} onChange={setPin} />
                  <Button className="w-full" size="lg" type="submit" disabled={pin.length !== 6 || Date.now() < lockUntil}><KeyRound />{Date.now() < lockUntil ? "Try again shortly" : "Unlock locally"}</Button>
                </form>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="ghost" className="mt-4 text-xs text-muted-foreground"><RotateCcw />Forgot PIN?</Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Reset the encrypted Private Vault?</AlertDialogTitle><AlertDialogDescription>Your PIN cannot be recovered. Resetting permanently deletes every private item on this device. Your normal ChatSaver notes are not affected.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Keep vault</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void resetPrivateVault().then(() => { setPhase("intro"); toast.success("Private Vault reset"); })}>Delete private items</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </section>
        ) : null}

        {phase === "unlocked" ? (
          <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div><Badge variant="outline" className="border-emerald-300/25 bg-emerald-300/8 text-emerald-200"><ShieldCheck />Unlocked on this device</Badge><h1 className="mt-4 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">Private saves</h1><p className="mt-2 text-sm text-muted-foreground">{items.length} encrypted item{items.length === 1 ? "" : "s"} · locks automatically</p></div>
              <Button size="lg" className="royal-glow gap-2" onClick={() => setItemEditor(null)}><Plus />Quick save</Button>
            </div>
            <label className="relative mt-7 block max-w-xl"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-11 ps-10" type="search" placeholder="Search decrypted items in this session" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            {visibleItems.length ? (
              <div className="mt-7 grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleItems.map((item) => (
                  <Card className={`group overflow-hidden border-white/8 bg-black/24 transition-colors hover:border-primary/22 ${item.pinned ? "border-primary/20 bg-primary/[0.035]" : ""}`} key={item.id}>
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3"><button type="button" className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${item.pinned ? "bg-primary/14 text-primary" : "bg-white/5 text-muted-foreground"}`} aria-label={item.pinned ? "Unpin item" : "Pin item"} onClick={() => void togglePinned(item)}>{item.pinned ? <Pin className="size-3.5 fill-current" /> : <Link2 className="size-3.5" />}</button><div className="min-w-0 flex-1"><h2 className="break-words text-base font-semibold tracking-[-0.02em]">{item.title}</h2>{item.link ? <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-wide text-primary/75">{new URL(item.link).hostname}</p> : null}</div></div>
                      {item.description ? <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{item.description}</p> : <p className="mt-4 text-sm italic text-muted-foreground/55">No description</p>}
                      {item.link ? <Button asChild variant="outline" className="mt-5 w-full justify-between"><a href={item.link} target="_blank" rel="noreferrer"><span className="truncate">Open link</span><ArrowUpRight /></a></Button> : null}
                      <div className="mt-4 flex items-center justify-between border-t border-white/7 pt-3"><time className="font-mono text-[8px] uppercase tracking-wide text-muted-foreground">{new Date(item.updatedAt).toLocaleDateString()}</time><div className="flex gap-1"><Button variant="ghost" size="icon-sm" aria-label={`Copy ${item.title} link`} disabled={!item.link} onClick={() => void navigator.clipboard.writeText(item.link).then(() => toast.success("Link copied"))}><Copy /></Button><Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.title}`} onClick={() => setItemEditor(item)}><Pencil /></Button><AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon-sm" className="text-destructive" aria-label={`Delete ${item.title}`}><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete “{item.title}”?</AlertDialogTitle><AlertDialogDescription>This permanently removes the encrypted item from this device.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void deletePrivateVaultItem(item.id).then(() => vaultKey && loadItems(vaultKey))}>Delete item</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="mt-8 rounded-3xl border border-dashed border-white/10 bg-black/15 px-6 py-16 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><ExternalLink /></span><h2 className="mt-5 text-xl font-semibold">{query ? "No private saves match" : "Your private space is ready"}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{query ? "Try a different title, link, or description." : "Save an important link with a short title and description. It will be encrypted immediately."}</p>{!query ? <Button className="mt-6" onClick={() => setItemEditor(null)}><Plus />Save first item</Button> : null}</div>
            )}
          </section>
        ) : null}
      </div>

      <ItemDialog open={itemEditor !== undefined} item={itemEditor ?? undefined} onOpenChange={(open) => { if (!open) setItemEditor(undefined); }} onSave={saveItem} />
      <input ref={restoreInputRef} className="sr-only" type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void restoreBackup(file); }} />
    </main>
  );
}
