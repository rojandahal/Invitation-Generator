import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PeopleClient, type PersonRow } from "./people-client";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const user = await requireUser();

  const [people, invitationCount] = await Promise.all([
    prisma.person.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        nameEnglish: true,
        nameNepali: true,
        salutation: true,
        _count: { select: { guestLinks: true } },
      },
    }),
    prisma.invitation.count({ where: { userId: user.id } }),
  ]);

  const rows: PersonRow[] = people.map((p) => ({
    id: p.id,
    nameEnglish: p.nameEnglish,
    nameNepali: p.nameNepali,
    salutation: p.salutation,
    invitationCount: p._count.guestLinks,
  }));

  return <PeopleClient people={rows} invitationCount={invitationCount} />;
}
