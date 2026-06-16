import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CreateInvitationDialog } from "./create-invitation-dialog";
import {
  InvitationCard,
  type InvitationCardData,
} from "@/components/invitation-card";
import { ImagePlus } from "lucide-react";

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Invitations</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Upload a card, mark the name spot, then generate one per guest.
          </p>
        </div>
        <CreateInvitationDialog />
      </div>

      {cards.length === 0 ? (
        <div className="border-border/70 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <div className="bg-muted flex size-12 items-center justify-center rounded-full">
            <ImagePlus className="text-muted-foreground size-6" />
          </div>
          <div>
            <p className="font-medium">No invitations yet</p>
            <p className="text-muted-foreground text-sm">
              Create your first invitation to get started.
            </p>
          </div>
          <CreateInvitationDialog />
        </div>
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
