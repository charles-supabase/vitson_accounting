// Collections: tbl_Collections.check_name (smallint). 1 = Vitson International, 2 = Personal.
// Deposit banks follow it: Personal checks go to the banks named with the "Y_" prefix, Vitson International to the others.

export const CHECK_NAMES = [
  { id: 1, label: "Vitson International" },
  { id: 2, label: "Personal" },
] as const;

export const isPersonalBankName = (name: string) => /^Y_/i.test(String(name ?? "").trim());

/** The banks a check may be deposited to: none until a check name is chosen. */
export function banksForCheckName<T extends { label: string }>(banks: T[], checkName: number | null): T[] {
  if (checkName === 1) return banks.filter((b) => !isPersonalBankName(b.label));
  if (checkName === 2) return banks.filter((b) => isPersonalBankName(b.label));
  return [];
}
