// Amount in words (kept apart from lib/billing.ts, which needs the Supabase client, so tests can load it).
/** Indian-style amount in words: 21000 -> "Rupees Twenty-One Thousand Only" */
export function inWords(amount: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n: number) => (n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? "-" + ones[n % 10] : ""));
  const three = (n: number) => [Math.floor(n / 100) ? ones[Math.floor(n / 100)] + " Hundred" : "", n % 100 ? two(n % 100) : ""].filter(Boolean).join(" ");
  let r = Math.floor(amount); const p = Math.round((amount - r) * 100);
  if (r === 0 && p === 0) return "Rupees Zero Only";
  const parts: string[] = [];
  const cr = Math.floor(r / 10000000); r %= 10000000;
  const la = Math.floor(r / 100000); r %= 100000;
  const th = Math.floor(r / 1000); r %= 1000;
  if (cr) parts.push(three(cr) + " Crore"); if (la) parts.push(two(la) + " Lakh"); if (th) parts.push(two(th) + " Thousand"); if (r) parts.push(three(r));
  return `Rupees ${parts.join(" ") || "Zero"}${p ? ` and ${two(p)} Paise` : ""} Only`;
}
