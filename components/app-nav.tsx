"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import { SignOutButton } from "./sign-out-button";
import type { Role } from "@prisma/client";

export function AppNav({
  role,
  email,
}: {
  role: Role;
  email: string;
}) {
  const pathname = usePathname();

  const links = [
    { href: "/dashboard", label: "Invitations" },
    { href: "/people", label: "People" },
    ...(role === "ADMIN"
      ? [
          { href: "/admin/users", label: "Admin" },
          { href: "/admin/maintenance", label: "Maintenance" },
        ]
      : []),
  ];

  return (
    <header className="border-border/60 bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <Sparkles className="size-4" />
          <span className="hidden sm:inline">Invitation Generator</span>
        </Link>

        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-muted-foreground hidden text-sm md:inline">
            {email}
          </span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
