"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteStaff, type StaffState } from "./actions";

const initialState: StaffState = {};

export function InviteStaffForm() {
  const [state, formAction, pending] = useActionState(inviteStaff, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const nameId = useId();
  const emailId = useId();
  const roleId = useId();

  useEffect(() => {
    if (state.message) {
      toast.success(state.message);
      formRef.current?.reset();
    }
    if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Staff</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          ref={formRef}
          action={formAction}
          className="flex flex-col flex-wrap gap-3 sm:flex-row sm:items-end"
        >
          <div className="grid min-w-40 flex-1 gap-2">
            <Label htmlFor={nameId}>Full name</Label>
            <Input id={nameId} name="fullName" required autoComplete="off" maxLength={200} />
          </div>
          <div className="grid min-w-48 flex-1 gap-2">
            <Label htmlFor={emailId}>Email</Label>
            <Input id={emailId} name="email" type="email" required autoComplete="off" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={roleId}>Role</Label>
            <select
              id={roleId}
              name="role"
              defaultValue="staff"
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Sending invite…" : "Add Staff"}
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Sends an email invite. Requires SUPABASE_SERVICE_ROLE_KEY to be configured on the server
          — see .env.local.example.
        </p>
      </CardContent>
    </Card>
  );
}
