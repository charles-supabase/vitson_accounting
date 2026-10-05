const ONES = [
  "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE",
  "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN",
];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
const SCALES = ["", "THOUSAND", "MILLION", "BILLION", "TRILLION"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(ONES[Math.floor(n / 100)], "HUNDRED");
    n %= 100;
  }
  if (n >= 20) {
    const t = TENS[Math.floor(n / 10)];
    const o = ONES[n % 10];
    parts.push(o ? `${t}-${o}` : t);
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(" ");
}

function wholeToWords(n: number): string {
  if (n === 0) return "ZERO";
  const groups: string[] = [];
  let scale = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk > 0) groups.unshift([below1000(chunk), SCALES[scale]].filter(Boolean).join(" "));
    n = Math.floor(n / 1000);
    scale++;
  }
  return groups.join(" ");
}

/** 1234.5 -> "ONE THOUSAND TWO HUNDRED THIRTY-FOUR PESOS AND 50/100 ONLY" */
export function amountInWords(amount: number): string {
  const cents = Math.round(Math.abs(amount) * 100);
  const pesos = Math.floor(cents / 100);
  const centavos = cents % 100;
  const words = `${wholeToWords(pesos)} ${pesos === 1 ? "PESO" : "PESOS"}`;
  return centavos > 0
    ? `${words} AND ${String(centavos).padStart(2, "0")}/100 ONLY`
    : `${words} ONLY`;
}
