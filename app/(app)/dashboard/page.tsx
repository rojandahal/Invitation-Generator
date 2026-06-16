import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CreateInvitationDialog } from "./create-invitation-dialog";
import {
  InvitationCard,
  type InvitationCardData,
} from "@/components/invitation-card";
import { Card } from "@/components/ui/card";
import { MailPlus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();

  const invitations = await prisma.invitation.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      baseImagePublicId: true,
      baseImageFormat: true,
      marked: true,
      _count: { select: { guests: true } },
    },
  });

  // One grouped query for generated counts instead of N per-card queries.
  const generatedGroups = await prisma.invitationGuest.groupBy({
    by: ["invitationId"],
    where: { invitation: { userId: user.id }, status: "GENERATED" },
    _count: { _all: true },
  });
  const generatedByInvitation = new Map(
    generatedGroups.map((g) => [g.invitationId, g._count._all]),
  );

  const cards: InvitationCardData[] = invitations.map((inv) => ({
    id: inv.id,
    title: inv.title,
    baseImagePublicId: inv.baseImagePublicId,
    baseImageFormat: inv.baseImageFormat,
    marked: inv.marked,
    guestCount: inv._count.guests,
    generatedCount: generatedByInvitation.get(inv.id) ?? 0,
  }));

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-primary mb-2.5">
            {cards.length === 0
              ? "Your collection"
              : `${cards.length} ${cards.length === 1 ? "Card" : "Cards"}`}
          </p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Invitations
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Upload a card, mark the name spot, then generate one per guest.
          </p>
        </div>
        {cards.length > 0 ? <CreateInvitationDialog /> : null}
      </div>

      {cards.length === 0 ? (
        <Card
          keyline
          className="mx-auto w-full max-w-md items-center gap-4 px-8 py-14 text-center"
        >
          <div aria-hidden className="ornament w-full">
            ✦
          </div>
          <div className="bg-primary/10 text-primary ring-primary/20 flex size-14 items-center justify-center rounded-full ring-1">
            <MailPlus className="size-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="font-heading text-xl font-semibold">
              Address your first invitation
            </h2>
            <p className="text-muted-foreground mx-auto max-w-xs text-sm text-pretty">
              Upload a card design, mark where the name belongs, and we&apos;ll
              set one for every guest on your list.
            </p>
          </div>
          <CreateInvitationDialog />
          <div aria-hidden className="ornament w-full">
            ✦
          </div>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <InvitationCard key={card.id} invitation={card} />
          ))}
        </div>
      )}
    </div>
  );
}
