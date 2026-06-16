import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { ImageIcon, PenLine, Sparkles, Users } from "lucide-react";

const FEATURES = [
  {
    icon: ImageIcon,
    title: "Upload once",
    body: "Bring a JPG, PNG, or single-page PDF. We store it on a CDN and read its dimensions automatically.",
  },
  {
    icon: PenLine,
    title: "Mark the name spot",
    body: "Drag a box where each guest's name should sit. Pick the font, size, colour and alignment with a live preview.",
  },
  {
    icon: Users,
    title: "Manage your people",
    body: "Keep a master contact list with Nepali (Devanagari) transliteration, and attach guests to one card or all of them.",
  },
  {
    icon: Sparkles,
    title: "Generate in bulk",
    body: "Render a personalised image per guest right in your browser, track who's done, and download everything as a zip.",
  },
];

export default async function HomePage() {
  const session = await auth();
  const signedIn = Boolean(session?.user);

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <Image
          src="/website-logo.png"
          alt="Invitation Generation"
          width={1536}
          height={1024}
          priority
          className="mb-8 h-auto w-72 sm:w-80"
        />
        <span className="bg-primary/10 text-primary ring-primary/15 mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1">
          <Sparkles className="size-3.5" />
          Personalised invitations, in bulk
        </span>
        <h1 className="font-heading max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Turn one invitation into hundreds, each with{" "}
          <span className="text-primary">the right name</span>.
        </h1>
        <p className="text-muted-foreground mt-5 max-w-2xl text-base text-pretty sm:text-lg">
          Upload your card, mark where the name goes, manage your guest list in
          English or Nepali, and generate a personalised image for every guest —
          with downloads and status tracking.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {signedIn ? (
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href="/dashboard" />}
            >
              Go to dashboard
            </Button>
          ) : (
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href="/login" />}
            >
              Sign in to get started
            </Button>
          )}
        </div>
      </section>

      <section className="border-border/60 bg-muted/40 border-t">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-16 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="flex gap-4">
              <div className="bg-primary/10 text-primary ring-primary/15 flex size-11 shrink-0 items-center justify-center rounded-xl ring-1">
                <feature.icon className="size-5" />
              </div>
              <div>
                <h3 className="font-heading text-base font-medium">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground mt-1 text-sm text-pretty">
                  {feature.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="text-muted-foreground border-border/60 flex items-center justify-center gap-2 border-t px-6 py-6 text-center text-xs">
        <Image
          src="/fav.png"
          alt=""
          width={64}
          height={64}
          className="size-5 rounded"
        />
        <span>Invitation Generation</span>
      </footer>
    </main>
  );
}
