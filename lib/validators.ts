import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums (mirror the Prisma enums so server actions validate against the model)
// ---------------------------------------------------------------------------
export const roleEnum = z.enum(["ADMIN", "USER"]);
export const userStatusEnum = z.enum(["ACTIVE", "DISABLED"]);
export const guestStatusEnum = z.enum(["UNINVITED", "GENERATED"]);
export const alignEnum = z.enum(["left", "center", "right"]);
export const valignEnum = z.enum(["top", "middle", "bottom"]);

const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, "Must be a hex colour, e.g. #1a1a1a");

const fraction = z.number().min(0).max(1);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const loginSchema = z.object({
  email: z.email("Enter a valid email").transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Admin: user management
// ---------------------------------------------------------------------------
export const createUserSchema = z.object({
  email: z.email("Enter a valid email").transform((v) => v.toLowerCase().trim()),
  name: z.string().trim().max(120).optional().or(z.literal("")),
  password: z.string().min(8, "Use at least 8 characters").max(200),
  role: roleEnum.default("USER"),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const setUserStatusSchema = z.object({
  userId: z.string().min(1),
  status: userStatusEnum,
});

export const setUserRoleSchema = z.object({
  userId: z.string().min(1),
  role: roleEnum,
});

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------
export const createInvitationSchema = z.object({
  title: z.string().trim().min(1, "Give your invitation a title").max(160),
  baseImagePublicId: z.string().min(1),
  baseImageFormat: z.string().min(1).max(16),
  baseImageWidth: z.number().int().positive(),
  baseImageHeight: z.number().int().positive(),
  // Throwaway source asset (e.g. the original PDF we combined) to destroy after
  // the invitation is created. Server verifies it belongs to the user's folder.
  cleanupPublicId: z.string().max(400).optional(),
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const saveMarkSchema = z.object({
  invitationId: z.string().min(1),
  markX: fraction,
  markY: fraction,
  markWidth: fraction,
  markHeight: fraction,
  fontFamily: z.string().min(1).max(60), // Latin/English font key
  fontFamilyNepali: z.string().min(1).max(60).default("NotoSansDevanagari"),
  fontSizeRel: z.number().min(0.005).max(0.5),
  fontColor: hexColor,
  fontWeight: z.number().int().min(100).max(900).default(600),
  fontItalic: z.boolean().default(false),
  lineHeightRel: z.number().min(0.8).max(3).default(1.18),
  align: alignEnum,
  valign: valignEnum,
  maxLines: z.number().int().min(1).max(4).default(2),
});
export type SaveMarkInput = z.infer<typeof saveMarkSchema>;

export const renameInvitationSchema = z.object({
  invitationId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
});

// Optional honorifics rendered around the name at generation time.
export const saveNameAffixesSchema = z.object({
  invitationId: z.string().min(1),
  namePrefix: z.string().trim().max(40).default(""),
  nameSuffix: z.string().trim().max(40).default(""),
});

export const deleteInvitationSchema = z.object({
  invitationId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// People (contacts)
// ---------------------------------------------------------------------------
export const personSchema = z.object({
  nameEnglish: z.string().trim().min(1, "Name is required").max(120),
  nameNepali: z.string().trim().max(120).optional().or(z.literal("")),
  salutation: z.string().trim().max(40).optional().or(z.literal("")),
});
export type PersonInput = z.infer<typeof personSchema>;

export const updatePersonSchema = personSchema.extend({
  personId: z.string().min(1),
});

export const deletePersonSchema = z.object({
  personId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Invitation guests (the join)
// ---------------------------------------------------------------------------
export const attachPeopleSchema = z.object({
  invitationId: z.string().min(1),
  personIds: z.array(z.string().min(1)).min(1, "Select at least one person"),
});

export const attachToAllInvitationsSchema = z.object({
  personIds: z.array(z.string().min(1)).min(1),
});

export const updateGuestTextSchema = z.object({
  guestId: z.string().min(1),
  invitationText: z.string().trim().min(1, "Text cannot be empty").max(200),
});

export const removeGuestSchema = z.object({
  guestId: z.string().min(1),
});

export const saveGeneratedSchema = z.object({
  guestId: z.string().min(1),
  generatedPublicId: z.string().min(1),
});

export const resetGeneratedSchema = z.object({
  guestId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Cloudinary signed upload
// ---------------------------------------------------------------------------
export const signUploadSchema = z.object({
  kind: z.enum(["base", "generated"]),
});

// ---------------------------------------------------------------------------
// Admin: storage maintenance (orphaned-asset cleanup)
// ---------------------------------------------------------------------------
export const deleteOrphansSchema = z.object({
  publicIds: z
    .array(z.string().min(1).max(400))
    .min(1, "Select at least one image")
    .max(1000, "Too many at once — re-scan and delete in batches"),
});
