"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Small, self-contained client component for the one row action on this page — POSTs directly
// to the retry endpoint (src/app/api/notices/deliveries/[id]/retry/route.ts) rather than going
// through a Server Action wrapper, since there's no form state or validation to own here beyond
// what the endpoint itself already does.
export function RetryDeliveryButton({ deliveryId }: { deliveryId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onRetry = async () => {
    setPending(true);
    try {
      const res = await fetch(`/api/notices/deliveries/${deliveryId}/retry`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.ok) {
        toast.success("Retry sent.");
        router.refresh();
      } else {
        toast.error(data?.error ?? "Could not retry this delivery.");
      }
    } catch {
      toast.error("Could not retry this delivery — check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Button type="button" size="sm" variant="outline" onClick={onRetry} disabled={pending}>
      {pending ? "Retrying…" : "Retry"}
    </Button>
  );
}
