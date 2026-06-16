import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Ban, Sparkles } from "lucide-react";
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
          className="text-muted-foreground hover:text-foreground mb-6 flex items-center justify-center gap-2 text-sm font-medium"
        >
          <Sparkles className="size-4" />
          Invitation Generator
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sign in</CardTitle>
            <CardDescription>
              Use the account your administrator created for you.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
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
