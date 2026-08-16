"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Wordmark } from "./brand";
import { WalletButton } from "./WalletButton";
import { buttonClasses } from "./ui";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#gates", label: "Milestones" },
  { href: "/#trust", label: "Trust" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const inApp = pathname?.startsWith("/app") ?? false;

  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-surface-0/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
        <Link href="/" className="shrink-0">
          <Wordmark />
        </Link>

        {!inApp ? (
          <nav className="hidden gap-6 md:flex">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-ink-2 transition-colors hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="ml-auto flex items-center gap-3">
          {inApp ? (
            <WalletButton />
          ) : (
            <Link href="/app" className={buttonClasses("primary", "sm")}>
              Open the app
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
