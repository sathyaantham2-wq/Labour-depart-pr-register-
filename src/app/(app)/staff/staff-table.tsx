"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toggleActive, updateRole, type StaffState } from "./actions";

export type StaffRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  active: boolean;
};

const initialState: StaffState = {};

export function StaffTable({
  staff,
  currentUserId,
}: {
  staff: StaffRow[];
  currentUserId: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {staff.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              No staff yet.
            </TableCell>
          </TableRow>
        ) : (
          staff.map((person) => (
            // Keyed on role/active too, so a server-revalidated update
            // remounts the row and its local <select> state stays in sync.
            <StaffRowItem
              key={`${person.id}-${person.role}-${person.active}`}
              person={person}
              isSelf={person.id === currentUserId}
            />
          ))
        )}
      </TableBody>
    </Table>
  );
}

function StaffRowItem({ person, isSelf }: { person: StaffRow; isSelf: boolean }) {
  const [role, setRole] = useState(person.role);
  const roleId = useId();

  const [roleState, roleAction, rolePending] = useActionState(updateRole, initialState);
  const [activeState, activeAction, activePending] = useActionState(toggleActive, initialState);

  useEffect(() => {
    if (roleState.message) toast.success(roleState.message);
    if (roleState.error) toast.error(roleState.error);
  }, [roleState]);

  useEffect(() => {
    if (activeState.message) toast.success(activeState.message);
    if (activeState.error) toast.error(activeState.error);
  }, [activeState]);

  return (
    <TableRow>
      <TableCell className="font-medium">
        {person.full_name || "—"}
        {isSelf && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
      </TableCell>
      <TableCell className="text-muted-foreground">{person.email}</TableCell>
      <TableCell>
        <form action={roleAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={person.id} />
          <label htmlFor={roleId} className="sr-only">
            Role for {person.full_name || person.email}
          </label>
          <select
            id={roleId}
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={rolePending || role === person.role}
          >
            {rolePending ? "Saving…" : "Save"}
          </Button>
        </form>
      </TableCell>
      <TableCell>
        <Badge variant={person.active ? "default" : "outline"}>
          {person.active ? "Active" : "Inactive"}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <form action={activeAction}>
          <input type="hidden" name="id" value={person.id} />
          <input type="hidden" name="active" value={(!person.active).toString()} />
          <Button
            type="submit"
            size="sm"
            variant={person.active ? "destructive" : "outline"}
            disabled={activePending || isSelf}
            title={isSelf ? "You cannot deactivate your own account." : undefined}
          >
            {activePending ? "Saving…" : person.active ? "Deactivate" : "Reactivate"}
          </Button>
        </form>
      </TableCell>
    </TableRow>
  );
}
