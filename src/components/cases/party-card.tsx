import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PARTY_ROLE_LABELS, type PartyRole } from "./constants";
import { PartyForm, type PartyRecord } from "./party-form";
import { formatPhones } from "./party-schema";

export function PartyCard({
  caseId,
  role,
  party,
}: {
  caseId: string;
  role: PartyRole;
  party: PartyRecord | null;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{PARTY_ROLE_LABELS[role]}</CardTitle>
        <PartyForm caseId={caseId} role={role} party={party} />
      </CardHeader>
      <CardContent>
        {!party ? (
          <p className="text-sm text-muted-foreground">
            No {PARTY_ROLE_LABELS[role].toLowerCase()} added yet.
          </p>
        ) : (
          <dl className="grid gap-2 text-sm">
            <Row label="Name" value={party.name} />
            <Row label="Phone" value={formatPhones(party.phone)} />
            <Row label="WhatsApp" value={party.whatsapp_phone ?? "—"} />
            <Row label="Email" value={party.email ?? "—"} />
            <Row label="Address" value={party.address ?? "—"} />
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2 break-words">{value}</dd>
    </div>
  );
}
