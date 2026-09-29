const rupees = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

// Indian digit grouping (12,34,567), e.g. formatRupees(1234567.5) -> "₹12,34,567.5".
export function formatRupees(amount: number): string {
  return `₹${rupees.format(amount)}`;
}
