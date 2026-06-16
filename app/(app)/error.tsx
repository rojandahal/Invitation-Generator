"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <h1 className="font-heading text-2xl font-semibold">
        Something went wrong
      </h1>
      <p className="text-muted-foreground max-w-md text-sm">
        An unexpected error occurred. You can try again, or head back to your
        dashboard.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>
          <RotateCcw />
          Try again
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/dashboard" />}
        >
          Dashboard
        </Button>
      </div>
    </div>
  );
}
