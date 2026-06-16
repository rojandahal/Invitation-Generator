import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { findOwnedInvitation } from "@/lib/ownership";
import { MarkingEditor, type EditorInvitation } from "./marking-editor";

export const dynamic = "force-dynamic";

export default async function MarkPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const user = await requireUser();
  const { invitationId } = await params;

  const invitation = await findOwnedInvitation(user.id, invitationId);
  if (!invitation) notFound();

  const data: EditorInvitation = {
    id: invitation.id,
    title: invitation.title,
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
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/${invitation.id}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          ← {invitation.title}
        </Link>
        <h1 className="font-heading mt-2 text-3xl font-semibold tracking-tight">
          Mark the name spot
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Drag the box where each guest&apos;s name should sit, then set the
          font, size, and alignment.
        </p>
      </div>
      <MarkingEditor invitation={data} />
    </div>
  );
}
