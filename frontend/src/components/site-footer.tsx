import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/about", label: "About" },
  { href: "/integrations", label: "Integrations" },
  { href: "/private-vault", label: "Private Vault" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/support", label: "Support" },
] as const;

export function SiteFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer
      className={`relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/8 bg-black/20 px-5 text-[10px] text-white/45 sm:px-8 lg:px-12 ${
        compact ? "min-h-10 py-2" : "min-h-15 py-3"
      }`}
    >
      <span>© {new Date().getFullYear()} ChatSaver</span>
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Footer navigation">
        {FOOTER_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="transition-colors hover:text-white focus-visible:text-white"
          >
            {item.label}
          </Link>
        ))}
        <a
          href="mailto:vivekgotstack@gmail.com"
          className="transition-colors hover:text-white focus-visible:text-white"
        >
          Contact
        </a>
      </nav>
    </footer>
  );
}
