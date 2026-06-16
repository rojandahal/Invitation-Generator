# Invitation Generator

Create personalised invitation cards in bulk. Upload a card (image or PDF), mark
where each guest's name should print, manage a master contact list (with Nepali /
Devanagari transliteration), then generate one image per guest — with status
tracking, individual downloads, and bulk `.zip` export.

Image generation runs **in the browser** (HTML canvas) and the resulting PNGs are
uploaded to Cloudinary, so there are no server function timeouts even for large
batches.

## Stack

| Concern        | Choice                                             |
| -------------- | -------------------------------------------------- |
| Framework      | Next.js 16 (App Router) + React 19 + TypeScript    |
| UI             | Tailwind CSS v4 + shadcn/ui (Base UI primitives)   |
| Database       | Neon Postgres via Prisma 6                          |
| Auth           | Auth.js v5 (Credentials), JWT sessions             |
| Media          | Cloudinary (base images, PDF→image, generated PNGs)|
| Rendering      | HTML canvas + Noto Sans Devanagari webfont         |
| Transliteration| Google Input Tools (proxied) with manual fallback  |
| Bulk zip       | JSZip (in the browser)                             |
| Validation     | Zod on every server action                          |

## Prerequisites

- Node.js 20+
- A [Neon](https://neon.tech) Postgres database
- A [Cloudinary](https://cloudinary.com) account

## 1. Environment

Copy `.env.example` to `.env` and fill in real values:

```bash
cp .env.example .env
```

| Variable                          | What it is                                                        |
| --------------------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`                    | Neon connection string (pooled is fine)                           |
| `AUTH_SECRET`                     | Random secret — generate with `npx auth secret`                   |
| `CLOUDINARY_CLOUD_NAME`           | Cloudinary cloud name                                             |
| `CLOUDINARY_API_KEY`              | Cloudinary API key (server-only)                                  |
| `CLOUDINARY_API_SECRET`           | Cloudinary API secret (server-only)                               |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Public copy of the cloud name — browser builds delivery URLs    |
| `CLOUDINARY_FOLDER`               | Folder for uploads (default `invitation-generator`)               |
| `SEED_ADMIN_EMAIL/PASSWORD/NAME`  | Used by `npm run db:seed` to create the first admin               |

## 2. Database

```bash
npm install              # also runs `prisma generate`
npm run db:push          # create tables on Neon (or: npm run db:migrate)
npm run db:seed          # create the first ADMIN user from SEED_ADMIN_* vars
```

## 3. Cloudinary setup

- Uploads go **directly from the browser** to Cloudinary using a short-lived
  signature generated server-side (`app/actions/upload.ts`). No unsigned upload
  preset is required.
- **PDF base images:** Cloudinary delivers page 1 as a raster (`pg_1`). New
  accounts disable PDF/ZIP delivery by default — if PDF cards don't show, enable
  **Settings → Security → "Allow delivery of PDF and ZIP files."** Plain image
  cards (PNG/JPG/WebP) need no extra setup.

## 4. Run

```bash
npm run dev      # http://localhost:3000
```

Sign in with the seeded admin, then:

1. **Admin → Users** — create accounts (admins or users), enable/disable them.
2. **Invitations → Create** — upload a card; you're taken to the marking editor.
3. **Mark** — drag the box over the name spot, pick font/size/colour/alignment,
   save.
4. **People** — build your contact list (English + Nepali name + salutation).
5. **Invitation → Add people** — attach guests, edit per-guest text, then
   **Generate** (single or bulk) and **Download** (individual or `.zip`).

## Useful scripts

| Script              | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Dev server                               |
| `npm run build`     | Production build                         |
| `npm run typecheck` | `tsc --noEmit`                           |
| `npm run db:push`   | Push schema to the database              |
| `npm run db:studio` | Prisma Studio                            |
| `npm run db:seed`   | Seed the first admin                     |

## Deploy to Vercel

1. Push to a Git repo and import the project on Vercel.
2. Add **all** the env vars from the table above in
   **Project → Settings → Environment Variables**.
3. Vercel runs `npm install` (which runs `prisma generate`) and `npm run build`.
4. Run `npm run db:push` and `npm run db:seed` against your production
   `DATABASE_URL` once (locally with prod env, or via a one-off job).

> The Vercel Hobby plan is for non-commercial use; a real product with users
> will likely need Pro. Cloudinary serves the images, so Vercel bandwidth stays
> low.

## Security & design notes

- Every server action validates input with **Zod** and enforces **ownership** —
  a user can only touch their own invitations, people, and guests; `/admin/*`
  requires the `ADMIN` role.
- **Disabled users** are blocked at login and re-checked against the database on
  every protected request (see `lib/session.ts`), so disabling takes effect on
  their next interaction regardless of an existing token.
- Login has basic in-memory rate limiting (`lib/rate-limit.ts`). On serverless
  this is best-effort per instance — swap for Upstash Redis / `@vercel/kv` if you
  need it to be authoritative.
- The text mark is stored **normalized (0–1)** against the natural image size, so
  it lines up at any output resolution. One shared renderer (`lib/render.ts`)
  powers both the editor preview and batch generation, so output matches exactly.
- Transliteration uses an **unofficial** Google endpoint, isolated behind
  `/api/transliterate` and `<NepaliInput>`; it degrades gracefully to a plain
  text field if unavailable.
