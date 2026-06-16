import "server-only";
import { prisma } from "./prisma";

/**
 * Ownership helpers. Every mutating server action MUST go through one of these
 * so a user can only ever touch their own invitations / people / guests.
 */

export function findOwnedInvitation(userId: string, invitationId: string) {
  return prisma.invitation.findFirst({
    where: { id: invitationId, userId },
  });
}

export function findOwnedPerson(userId: string, personId: string) {
  return prisma.person.findFirst({
    where: { id: personId, userId },
  });
}

/** A guest link is "owned" when its invitation belongs to the user. */
export function findOwnedGuest(userId: string, guestId: string) {
  return prisma.invitationGuest.findFirst({
    where: { id: guestId, invitation: { userId } },
    include: { invitation: true, person: true },
  });
}
