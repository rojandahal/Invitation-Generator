"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { loginSchema } from "@/lib/validators";
import { checkLoginRateLimit } from "@/lib/rate-limit";

export type LoginState = { error?: string } | undefined;

/** Only allow same-origin relative redirect targets. */
function safeCallback(value: FormDataEntryValue | null): string {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/dashboard";
}

export async function authenticate(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  // Basic brute-force protection, keyed by email.
  const limited = checkLoginRateLimit(parsed.data.email);
  if (!limited.allowed) {
    return {
      error: `Too many attempts. Try again in ${limited.retryAfterSeconds}s.`,
    };
  }

  const callbackUrl = safeCallback(formData.get("callbackUrl"));

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: callbackUrl,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error: "Invalid email or password, or this account has been disabled.",
      };
    }
    // signIn throws a redirect on success — let Next handle it.
    throw error;
  }
  return undefined;
}
