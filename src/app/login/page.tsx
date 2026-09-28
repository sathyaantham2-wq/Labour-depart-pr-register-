import type { Metadata } from "next";
import { ScaleIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;

  return (
    <main className="bg-ambient relative flex flex-1 items-center justify-center overflow-hidden bg-[oklch(0.16_0.02_264)] px-4 py-12">
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] shadow-glow-primary">
            <ScaleIcon className="size-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-heading text-lg font-semibold tracking-tight text-white">
              Labour Case Register
            </h1>
            <p className="text-sm text-white/50">Telangana Labour Department</p>
          </div>
        </div>

        <Card className="w-full shadow-elevation-4">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Use your department account to continue.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {error === "link" && (
              <p role="alert" className="text-sm text-destructive">
                That sign-in link is invalid or has expired. Request a new one.
              </p>
            )}
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
