// Excel stores dates as days since 1899-12-30; computing the serial directly avoids the
// timezone shift that converting a JS Date would introduce (a classic off-by-one-day bug).
export function excelDateSerial(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;
}
