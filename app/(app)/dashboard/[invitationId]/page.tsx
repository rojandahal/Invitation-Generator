import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { guestDefaultText, personDisplayName } from "@/lib/person";
import {
  InvitationDetail,
  type DetailInvitation,
  type GuestRow,
} from "./invitation-detail";

export const dynamic = "force-dynamic";

export default async function InvitationDetailPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const user = await requireUser();
  const { invitationId } = await params;

  const invitation = await prisma.invitation.findFirst({
    where: { id: invitationId, userId: user.id },
    include: {
      guests: {
        include: { person: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!invitation) notFound();

  const attached = new Set(invitation.guests.map((g) => g.personId));
  const allPeople = await prisma.person.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  const availablePeople = allPeople
    .filter((p) => !attached.has(p.id))
    .map((p) => ({ id: p.id, name: personDisplayName(p) }));

  const guests: GuestRow[] = invitation.guests.map((g) => ({
    id: g.id,
    personId: g.personId,
    name: personDisplayName(g.person),
    nameEnglish: g.person.nameEnglish,
    nameNepali: g.person.nameNepali ?? "",
    invitationText: g.invitationText,
    // The auto default; the client compares it live against invitationText to
    // decide whether the guest is customized (renders verbatim) or language-driven.
    defaultText: guestDefaultText(g.person),
    status: g.status,
    generatedPublicId: g.generatedPublicId,
  }));

  const detail: DetailInvitation = {
    id: invitation.id,
    title: invitation.title,
    marked: invitation.marked,
    baseImagePublicId: invitation.baseImagePublicId,
    baseImageFormat: invitation.baseImageFormat,
    baseImageWidth: invitation.baseImageWidth,
    baseImageHeight: invitation.baseImageHeight,
    markX: invitation.markX,
    markY: invitation.markY,
    markWidth: invitation.markWidth,
    markHeight: invitation.markHeight,
    fontFamily: invitation.fontFamily,
    fontFamilyNepali: invitation.fontFamilyNepali,
    fontSizeRel: invitation.fontSizeRel,
    fontColor: invitation.fontColor,
    fontWeight: invitation.fontWeight,
    fontItalic: invitation.fontItalic,
    lineHeightRel: invitation.lineHeightRel,
    align: invitation.align,
    valign: invitation.valign,
    maxLines: invitation.maxLines,
    nameLanguage: invitation.nameLanguage as "en" | "ne",
    namePrefixEn: invitation.namePrefixEn,
    namePrefixNe: invitation.namePrefixNe,
    nameSuffixEn: invitation.nameSuffixEn,
    nameSuffixNe: invitation.nameSuffixNe,
  };

  return (
    <InvitationDetail
      invitation={detail}
      guests={guests}
      availablePeople={availablePeople}
    />
  );
}
