import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Proxy to Google Input Tools (romanized → Devanagari).
 *
 * Proxying server-side avoids CORS issues and keeps this UNOFFICIAL dependency
 * isolated in one place — swap the provider here and <NepaliInput> keeps working.
 * Requires a session so it can't be used as an open proxy.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ suggestions: [] }, { status: 401 });
  }

  const text = new URL(request.url).searchParams.get("text")?.trim();
  if (!text) {
    return NextResponse.json({ suggestions: [] });
  }

  const endpoint =
    "https://inputtools.google.com/request?" +
    new URLSearchParams({
      text,
      itc: "ne-t-i0-und",
      num: "6",
      cp: "0",
      cs: "1",
      ie: "utf-8",
      oe: "utf-8",
    }).toString();

  try {
    const res = await fetch(endpoint, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return NextResponse.json({ suggestions: [] });

    const data = (await res.json()) as unknown;
    const suggestions = parseSuggestions(data);
    return NextResponse.json(
      { suggestions },
      { headers: { "Cache-Control": "public, max-age=86400" } },
    );
  } catch {
    // Endpoint is unofficial — degrade gracefully to no suggestions.
    return NextResponse.json({ suggestions: [] });
  }
}

function parseSuggestions(data: unknown): string[] {
  // Shape: ["SUCCESS", [[ "<input>", ["स","सु",...], [], {} ]]]
  if (
    Array.isArray(data) &&
    data[0] === "SUCCESS" &&
    Array.isArray(data[1]) &&
    Array.isArray(data[1][0]) &&
    Array.isArray(data[1][0][1])
  ) {
    return (data[1][0][1] as unknown[]).filter(
      (s): s is string => typeof s === "string",
    );
  }
  return [];
}
