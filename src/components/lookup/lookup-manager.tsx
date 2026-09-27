"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateIST } from "@/lib/format-date";

export type LookupState = { error?: string; message?: string };

export type LookupItem = { id: string; name: string; created_at: string };

type LookupAction = (prevState: LookupState, formData: FormData) => Promise<LookupState>;

type LookupManagerProps = {
  /** Label for the name input, e.g. "Section name". */
  nameFieldLabel: string;
  /** Button/card title for adding, e.g. "Add section". */
  addLabel: string;
  /** List card title (item count is appended), e.g. "All sections". */
  listTitle: string;
  /** Shown when the list is empty, e.g. "No sections yet." */
  emptyMessage: string;
  /** Delete confirmation dialog title, e.g. "Delete this section?" */
  deleteTitle: string;
  items: LookupItem[];
  isAdmin: boolean;
  addAction: LookupAction;
  deleteAction: LookupAction;
};

const initialState: LookupState = {};

export function LookupManager({
  nameFieldLabel,
  addLabel,
  listTitle,
  emptyMessage,
  deleteTitle,
  items,
  isAdmin,
  addAction,
  deleteAction,
}: LookupManagerProps) {
  return (
    <div className="grid gap-6">
      {isAdmin && (
        <AddForm addLabel={addLabel} nameFieldLabel={nameFieldLabel} addAction={addAction} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {listTitle} ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Created</TableHead>
                  {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateIST(item.created_at)}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <DeleteButton item={item} deleteTitle={deleteTitle} deleteAction={deleteAction} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddForm({
  addLabel,
  nameFieldLabel,
  addAction,
}: {
  addLabel: string;
  nameFieldLabel: string;
  addAction: LookupAction;
}) {
  const [state, formAction, pending] = useActionState(addAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const inputId = useId();

  useEffect(() => {
    if (state.message) {
      toast.success(state.message);
      formRef.current?.reset();
    }
    if (state.error) {
      toast.error(state.error);
    }
    // Re-run whenever the action returns a new state, even if the text repeats.
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{addLabel}</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-2">
            <Label htmlFor={inputId}>{nameFieldLabel}</Label>
            <Input id={inputId} name="name" required autoComplete="off" maxLength={200} />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : addLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DeleteButton({
  item,
  deleteTitle,
  deleteAction,
}: {
  item: LookupItem;
  deleteTitle: string;
  deleteAction: LookupAction;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(deleteAction, initialState);

  useEffect(() => {
    if (state.message) {
      toast.success(state.message);
      // Close the dialog once the delete completes — reacting to the
      // server action's result, not to a locally-derivable value.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    }
    if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="sm" />}>
        Delete
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{deleteTitle}</DialogTitle>
          <DialogDescription>
            This will permanently remove &ldquo;{item.name}&rdquo;. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <form action={formAction}>
            <input type="hidden" name="id" value={item.id} />
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
