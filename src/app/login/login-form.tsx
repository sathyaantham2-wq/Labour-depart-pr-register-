"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendMagicLink, signInWithPassword, type LoginState } from "./actions";

const initial: LoginState = {};

export function LoginForm() {
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword, initial);
  const [linkState, linkAction, linkPending] = useActionState(sendMagicLink, initial);
  const error = pwState.error ?? linkState.error;
  const pending = pwPending || linkPending;

  return (
    <form className="grid gap-4" action={pwAction}>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {linkState.message && !error && (
        <p role="status" className="text-sm text-muted-foreground">
          {linkState.message}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pwPending ? "Signing in…" : "Sign in"}
      </Button>
      <Button type="submit" variant="outline" formAction={linkAction} formNoValidate disabled={pending}>
        {linkPending ? "Sending link…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
