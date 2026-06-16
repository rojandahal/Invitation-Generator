# Invitation Generator — Implementation Plan

A multi-user web app to create invitation "cards" from an uploaded image/PDF, mark where a guest's name renders, manage a list of people (with Nepali transliteration), and generate per-person invitation images in bulk — with download and status tracking.

---

## 1. Architecture at a glance

```
Browser (Next.js, React)
  ├─ Auth UI, dashboards, marking editor, people manager
  ├─ Canvas renderer  ──────────────┐  (draws name onto base image)
  │                                  │
  ▼                                  ▼
Vercel (Next.js server / API routes / server actions)
  ├─ Auth.js sessions, role + status checks
  ├─ Prisma → Neon Postgres   (users, invitations, people, guest links, statuses)
  └─ Signed Cloudinary upload params
        │
        ▼
Cloudinary  (base images, PDF→image conversion, generated PNG storage + CDN + preview links)
```

**Three services, not two:**
- **Vercel** — hosts the Next.js app.
- **Neon Postgres** — the actual database (Cloudinary is NOT a database).
- **Cloudinary** — media storage, PDF→image conversion, and durable storage of generated invitations.

**Image generation runs in the browser (canvas), not in a server loop**, to avoid Vercel function timeouts and CPU billing. Generated PNGs are uploaded back to Cloudinary so each guest gets a stable preview link and bulk download works.

---

## 2. Tech stack & rationale

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js App Router + TypeScript | First-class on Vercel; server actions simplify CRUD |
| Styling/UI | Tailwind + shadcn/ui | Fast, consistent components (tables, dialogs, tabs) |
| Database | Neon Postgres | Serverless, Vercel-native, generous free tier |
| ORM | Prisma | Best DX for the relational model below (Drizzle is a lighter alternative) |
| Auth | Auth.js (NextAuth v5), Credentials provider | Full control over admin-created accounts + disable-user. (Clerk is a faster alt if you accept the vendor + cost; it gives ban/disable out of the box) |
| Media + generation storage | Cloudinary | Storage, PDF→image, CDN preview links |
| Image rendering | HTML Canvas (client) | WYSIWYG with the marking editor; no server timeouts; free Devanagari font |
| Transliteration | Google Input Tools (unofficial) + manual fallback | Romanized → Devanagari suggestions as the user types |
| Bulk zip | JSZip (client) | Zip generated images in the browser; no server timeout |
| Validation | Zod | Validate every server action / route input |

---

## 3. Data model (Prisma schema)

```prisma
enum Role        { ADMIN USER }
enum UserStatus  { ACTIVE DISABLED }
enum GuestStatus { UNINVITED GENERATED }

model User {
  id           String       @id @default(cuid())
  email        String       @unique
  passwordHash String
  name         String?
  role         Role         @default(USER)
  status       UserStatus   @default(ACTIVE)
  invitations  Invitation[]
  people       Person[]
  createdAt    DateTime     @default(now())
}

model Invitation {
  id                String            @id @default(cuid())
  userId            String
  user              User              @relation(fields: [userId], references: [id])
  title             String
  baseImagePublicId String            // Cloudinary public_id (PDF converted to image on upload)
  baseImageWidth    Int
  baseImageHeight   Int
  // Text mark stored NORMALIZED (0..1) so it maps to any render resolution:
  markX             Float             // left, fraction of width
  markY             Float             // top, fraction of height
  markWidth         Float             // fraction of width
  markHeight        Float             // fraction of height
  fontFamily        String            @default("NotoSansDevanagari")
  fontSizeRel       Float             @default(0.04) // fraction of image HEIGHT
  fontColor         String            @default("#000000")
  align             String            @default("center")  // left|center|right
  valign            String            @default("middle")  // top|middle|bottom
  guests            InvitationGuest[]
  createdAt         DateTime          @default(now())
}

model Person {
  id          String            @id @default(cuid())
  userId      String
  user        User              @relation(fields: [userId], references: [id])
  nameEnglish String
  nameNepali  String?
  salutation  String?           // Mr | Mrs | Ms | ...
  guestLinks  InvitationGuest[]
  createdAt   DateTime          @default(now())
}

model InvitationGuest {
  id                String      @id @default(cuid())
  invitationId      String
  invitation        Invitation  @relation(fields: [invitationId], references: [id])
  personId          String
  person            Person      @relation(fields: [personId], references: [id])
  invitationText    String      // defaults to person's display name; override per invitation
  status            GuestStatus @default(UNINVITED)
  generatedPublicId String?     // Cloudinary public_id of the generated image
  generatedAt       DateTime?
  createdAt         DateTime    @default(now())

  @@unique([invitationId, personId])
}
```

**Why this shape:** `Person` is a master contact list per user; `InvitationGuest` is the join that links a person to an invitation. That join is what enables "add this person to one invitation **or** to all," and it stores per-invitation `status` and the per-invitation text override. A person appears in many invitations with independent statuses.

---

## 4. Rendering strategy (the core of the app)

### Coordinate normalization (important — common bug source)
The marking editor displays the base image at some on-screen size (say 800px wide), but the real image may be 3000px wide. **Store the box as fractions of the natural image dimensions (0–1), and the font size as a fraction of image height.** At render time, multiply by the full resolution. This guarantees the mark you draw lines up at any output size.

### One shared render function
Write a single `renderInvitation(canvas, baseImage, mark, text)` module used by **both**:
1. the marking editor's live preview (with sample text), and
2. batch generation.

This is what makes the output exactly match what the user marked.

### Devanagari/Nepali text
Load **Noto Sans Devanagari** as a webfont and `await document.fonts.ready` before drawing — otherwise canvas renders boxes or falls back to a Latin font. Support auto-shrinking: if the text is wider than `markWidth`, reduce font size until it fits.

### Generation flow
- **Single:** render to canvas → `canvas.toBlob()` → upload PNG to Cloudinary (signed) → save `generatedPublicId`, set status `GENERATED`.
- **Bulk:** loop guests in the browser with a **concurrency-limited pool** (e.g., 4–6 at a time) and a progress bar; upload each result; update statuses. No server timeout because the heavy work is client-side; only lightweight DB updates hit Vercel.

### Bulk download
- Fetch each `generatedPublicId` URL and zip with **JSZip** in the browser, or
- a server route that streams a zip of already-stored Cloudinary URLs (fine for small sets; for hundreds, prefer client-side zipping).

### Alternative (Cloudinary text-overlay URLs)
You can skip canvas and generate via Cloudinary URL params (`l_text:<font>_<size>:<text>,g_north_west,x_,y_,co_`). It scales infinitely and "generate" is just a URL. **Caveat:** custom fonts (needed for Devanagari) require uploading the font as an authenticated raw asset, which is a paid Cloudinary plan feature (Advanced Extra+). Canvas avoids this cost. Keep this as a fallback if client machines struggle with very large batches.

---

## 5. Transliteration (Nepali name field)

- As the user types a romanized name, call the Google Input Tools endpoint
  (`https://inputtools.google.com/request?text=<word>&itc=ne-t-i0-und&num=5`) and show Devanagari suggestions in a dropdown.
- This endpoint is **unofficial and may change**. Always: (a) let the user pick a suggestion, (b) let them edit/paste Devanagari directly, (c) degrade gracefully to a plain text field if the request fails.
- Keep it in a small isolated `<NepaliInput>` component so swapping the provider later is trivial.

---

## 6. Auth & disable-user enforcement

- Admin-gated account creation: an admin creates users (and the first admin). Self-signup can be a toggle you keep off.
- Hash passwords with bcrypt/argon2.
- **Disabling a user must take effect promptly.** With JWT sessions, an existing token stays valid until expiry unless you check status. Enforce by reading `User.status` in the Auth.js `session`/`authorized` callback or doing a DB status check in middleware on protected routes; keep token lifetimes short. Block login for `DISABLED` users.
- Middleware protects `/dashboard/*` and `/admin/*`; `/admin/*` additionally requires `role === ADMIN`.

---

## 7. Phased build plan (Claude Code prompt seeds)

Each phase below is self-contained. Build and verify acceptance criteria before moving on. Paste the **prompt seed** into Claude Code and adjust as needed.

### Phase 0 — Project setup & infra
**Build:** Next.js (App Router, TS) + Tailwind + shadcn/ui. Add `.env` for `DATABASE_URL`, `NEXTAUTH_SECRET`, `CLOUDINARY_*`. Initialize Prisma against Neon. Create a Cloudinary account and a signed upload preset. Deploy a hello-world to Vercel.
**Acceptance:** App runs locally and on Vercel; `prisma db push` succeeds against Neon; a test Cloudinary upload from a script works.
**Prompt seed:**
> Scaffold a Next.js App Router TypeScript project with Tailwind and shadcn/ui. Set up Prisma with a Neon Postgres `DATABASE_URL`, add a `lib/cloudinary.ts` configured from env vars, and create a `.env.example`. Add a minimal landing page and confirm it deploys to Vercel.

### Phase 1 — Data model & migrations
**Build:** The Prisma schema in section 3, plus enums. Generate client and migrate.
**Acceptance:** All four tables exist with the `@@unique([invitationId, personId])` constraint; Prisma client generates without error.
**Prompt seed:**
> Add this Prisma schema [paste section 3], run the migration, and generate the client. Create typed Zod schemas mirroring each model for input validation in `lib/validators.ts`.

### Phase 2 — Auth & roles
**Build:** Auth.js v5 Credentials provider, password hashing, JWT sessions, login page, middleware protecting `/dashboard` and `/admin`, and DISABLED-user enforcement.
**Acceptance:** Can log in/out; disabled users are blocked at login and on protected routes; non-admins can't reach `/admin`.
**Prompt seed:**
> Implement Auth.js v5 with a Credentials provider using bcrypt against the `User` table. Add JWT sessions that include `role` and `status`. Add middleware protecting `/dashboard/*` (any logged-in active user) and `/admin/*` (ADMIN only). Block login and session for `status === DISABLED`. Build a login page with shadcn form components.

### Phase 3 — Admin panel
**Build:** `/admin/users` list with enable/disable toggles and a "create user" form; optional role change.
**Acceptance:** Admin can create a user, disable a user (who is then locked out), and re-enable.
**Prompt seed:**
> Build `/admin/users`: a table of all users with email, role, status, created date. Add a dialog to create a user (email, temp password, role) and per-row enable/disable buttons wired to server actions with Zod validation and ADMIN authorization checks.

### Phase 4 — Invitation creation + upload + PDF→image
**Build:** "Create Invitation" form (title + file). Upload image/PDF to Cloudinary via signed params; if PDF, store the first page rendered as an image and capture width/height. Create the `Invitation` row; show it as a card on the dashboard.
**Acceptance:** Uploading a JPG/PNG or a single-page PDF creates an invitation card; base image (PDF converted) is viewable; width/height saved.
**Prompt seed:**
> Build the dashboard at `/dashboard` listing the current user's invitations as cards, plus a "Create Invitation" dialog. On submit, upload the file to Cloudinary with signed upload (server action returns a signature). If the file is a PDF, store page 1 as an image and read its dimensions. Create an `Invitation` row with `baseImagePublicId`, `baseImageWidth`, `baseImageHeight`. (Assume single-page invitations.)

### Phase 5 — Marking editor
**Build:** A canvas/overlay editor showing the base image; user drags to draw/resize the text rectangle and picks font, size, color, horizontal & vertical alignment. Live preview renders sample text via the shared `renderInvitation` module. Save normalized mark to the `Invitation`.
**Acceptance:** The box and styled sample text appear; reopening the invitation restores the exact mark; coordinates are stored normalized.
**Prompt seed:**
> Build a marking editor at `/dashboard/[invitationId]/mark`. Render the base image at a fixed display width with a draggable, resizable rectangle overlay. Provide controls for font family (default Noto Sans Devanagari), font size, color, and alignment. Implement a shared `renderInvitation(canvas, image, mark, text)` used for the live preview with sample text. On save, convert the box and font size to fractions of the natural image dimensions and persist to the `Invitation`.

### Phase 6 — People (contacts) + transliteration
**Build:** Master people list per user (name, salutation, Nepali name via `<NepaliInput>`); a way to add people to a given invitation (single or "add all"), creating `InvitationGuest` rows with `invitationText` defaulting to the display name; per-guest text override.
**Acceptance:** Can add a person to the master list with a transliterated Nepali name; can attach people to one invitation or all; each link starts as UNINVITED with editable invitation text.
**Prompt seed:**
> Build a people manager: a master `Person` list per user with add/edit (name, salutation, and a `<NepaliInput>` component that fetches Google Input Tools suggestions with a manual-edit fallback). On an invitation's "People" tab, allow selecting people from the master list to attach (creating `InvitationGuest` rows, `invitationText` defaulting to the name) — including an "add to all my invitations" action. Allow editing `invitationText` per guest.

### Phase 7 — Generation (single + bulk) + statuses
**Build:** Client-side batch generation using the shared renderer; single generation with a choice of default name vs custom text; upload results to Cloudinary; flip UNINVITED → GENERATED; store `generatedPublicId`. Progress bar + concurrency pool for bulk.
**Acceptance:** "Select all → Generate" produces one correct image per guest with the name placed in the marked box; guests move to GENERATED; single generation with custom text works and is saved.
**Prompt seed:**
> On the invitation page, implement generation. For one guest, render with `renderInvitation` (offer "use name" or a custom invitation text), upload the PNG to Cloudinary, save `generatedPublicId`, set status GENERATED. For bulk, render selected UNINVITED guests in the browser with a concurrency-limited pool (max 5) and a progress bar, uploading each and updating status. Ensure `document.fonts.ready` resolves before rendering Devanagari.

### Phase 8 — Search, downloads, Generated page
**Build:** Search across UNINVITED + GENERATED within an invitation; individual download (search by name); bulk download via JSZip; a "Generated Invitation" page/tab; per-guest preview link (Cloudinary URL).
**Acceptance:** Searching filters both lists; individual and bulk (zip) downloads work; preview link opens the generated image.
**Prompt seed:**
> Add a search box filtering guests across both UNINVITED and GENERATED. Add a "Generated" tab/page. Implement individual download (find by name → download the Cloudinary image) and bulk download (select multiple → JSZip in the browser → single .zip). Show a copyable preview link per generated guest.

### Phase 9 — Polish, security, deploy
**Build:** Zod on every input, ownership checks (a user can only touch their own invitations/people), empty/loading/error states, Cloudinary credit-awareness, rate limiting on auth, final env wiring on Vercel.
**Acceptance:** No cross-user data access; graceful failures; production deploy works end-to-end.
**Prompt seed:**
> Harden the app: enforce that every server action checks the resource belongs to the current user (or ADMIN), validate all inputs with Zod, add loading/empty/error states across pages, add basic rate limiting to login, and document required Vercel env vars. Verify the full flow in production.

---

## 8. Risk register / gotchas

| Risk | Impact | Mitigation |
|---|---|---|
| Treating Cloudinary as a database | App can't work | Use Neon Postgres for data; Cloudinary only for media |
| Server-side bulk generation on Vercel | Timeouts / CPU billing | Render client-side; only DB writes hit the server |
| Cloudinary custom-font paywall (Devanagari) | Unexpected cost on overlay path | Use canvas + free Noto Sans Devanagari webfont |
| Devanagari renders as boxes | Broken Nepali names | `await document.fonts.ready` before drawing |
| Coordinate mismatch (editor vs output) | Name off-position | Store mark + font size as fractions; scale at render |
| Google Input Tools endpoint changes | Transliteration breaks | Isolate in `<NepaliInput>`; manual/paste fallback |
| Huge batches in the browser | Slow / memory | Concurrency pool + progress; consider Cloudinary overlay for very large sets |
| Disabled user keeps a valid JWT | Lockout delayed | Check `status` in callback/middleware; short token TTL |
| Long text overflows the box | Clipped names | Auto-shrink font to fit `markWidth` |
| Cloudinary free-tier credit/transformation limits | Generation stalls at scale | Monitor usage; canvas reduces transformation calls |

---

## 9. Cost notes

- **Vercel Hobby** is for non-commercial use; if this is a real product with users, you'll likely need **Pro (~$20/mo)**, which also raises function limits and adds spend controls. Bandwidth overages are billed per GB beyond the included allowance — but since Cloudinary serves the images, your Vercel bandwidth stays low.
- **Neon** and **Cloudinary** both have usable free tiers; the Cloudinary free tier is bounded by monthly credits (storage + transformations + bandwidth), so heavy generation may push you to a paid tier eventually.

---

## 10. Open decisions to confirm before you start

1. **People scope:** plan assumes a per-user master list + a join to invitations (supports "add to one or all"). Confirm you don't need people shared *across users*.
2. **Auth:** plan uses Auth.js Credentials (full control, free). If you'd rather not build user management, Clerk gives disable/ban out of the box for a fee.
3. **PDF:** plan assumes single-page invitations. If multi-page, add page selection.
4. **Rendering engine:** plan recommends client-side canvas. Confirm batches are realistically in the hundreds (fine for canvas) and not tens of thousands at once.
5. **Cloudinary plan:** if you prefer the URL-overlay generation path, budget for a plan that allows custom fonts.