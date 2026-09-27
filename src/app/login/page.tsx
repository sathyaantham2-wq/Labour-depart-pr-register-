import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Labour Case Register</CardTitle>
          <CardDescription>Sign in with your department account.</CardDescription>
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
    </main>
  );
}
