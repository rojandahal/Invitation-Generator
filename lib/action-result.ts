/** Standard return shape for server actions invoked from the client. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

/** Pull a human-friendly first message out of a Zod safeParse error. */
export function firstZodError(
  error: { issues?: { message: string }[] } | null | undefined,
  fallback = "Invalid input.",
): string {
  return error?.issues?.[0]?.message ?? fallback;
}
