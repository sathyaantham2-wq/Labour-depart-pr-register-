import type { Metadata } from "next";
import { ScaleIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;

  return (
    <main className="bg-hero relative flex flex-1 items-center justify-center overflow-hidden px-4 py-12">
      <div aria-hidden className="animate-float-slow pointer-events-none absolute -top-24 -left-24 size-96 rounded-full bg-gradient-to-br from-vivid-violet/40 to-transparent blur-2xl" />
      <div aria-hidden className="animate-float-slow pointer-events-none absolute -right-20 -bottom-24 size-96 rounded-full bg-gradient-to-tl from-vivid-teal/35 to-transparent blur-2xl [animation-delay:-5s]" />
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="tile-3d flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[oklch(0.74_0.2_300)] via-[oklch(0.6_0.23_280)] to-[oklch(0.68_0.15_215)] ring-1 ring-white/30 [--tile-glow:oklch(0.62_0.22_285/0.6)]">
            <ScaleIcon className="size-8 text-white drop-shadow-md" />
          </div>
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight text-white drop-shadow-sm">
              Labour Case Register
            </h1>
            <p className="text-sm text-white/65">Telangana Labour Department</p>
          </div>
        </div>

        <Card className="w-full shadow-elevation-4 ring-white/20">
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
