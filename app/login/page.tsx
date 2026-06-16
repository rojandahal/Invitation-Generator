import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Ban } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ disabled?: string; callbackUrl?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const { disabled, callbackUrl } = await searchParams;
  const safeCallback =
    callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
      ? callbackUrl
      : "/dashboard";

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          aria-label="Invitation Generation — home"
          className="mb-8 flex items-center justify-center"
        >
          <Image
            src="/website-logo.png"
            alt="Invitation Generation"
            width={1536}
            height={1024}
            priority
            className="h-auto w-56"
          />
        </Link>

        <Card keyline className="shadow-lg shadow-primary/10">
          <CardHeader className="px-7 pt-3 text-center">
            <CardTitle className="font-heading text-2xl font-semibold">
              Welcome back
            </CardTitle>
            <div aria-hidden className="ornament w-full pt-1 pb-0.5">
              ✦
            </div>
            <CardDescription>
              Sign in with the account your administrator created for you.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 px-7 pb-7">
            {disabled ? (
              <Alert variant="destructive">
                <Ban />
                <AlertDescription>
                  This account has been disabled. Contact your administrator.
                </AlertDescription>
              </Alert>
            ) : null}
            <LoginForm callbackUrl={safeCallback} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
