"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
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
    <header className="border-border/70 bg-background/80 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-15 w-full max-w-6xl items-center gap-6 px-6">
        <Link
          href="/dashboard"
          className="group flex items-center gap-2.5"
          aria-label="Invitation Generation — dashboard"
        >
          <Image
            src="/fav.png"
            alt=""
            width={64}
            height={64}
            priority
            className="size-9 rounded-lg ring-1 ring-border/60 transition-transform group-hover:scale-105"
          />
          <span className="font-heading hidden text-[15px] leading-none font-semibold tracking-tight sm:inline">
            Invitation <span className="text-primary">Generation</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
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
