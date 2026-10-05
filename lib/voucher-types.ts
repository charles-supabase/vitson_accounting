/** typeId 1 = Original (voucher numbers end in -A), 2 = Duplicate (numbers end in -B) */
export type VoucherTypeId = 1 | 2;

export const VOUCHER_SUFFIX: Record<VoucherTypeId, string> = { 1: "-A", 2: "-B" };

export const VOUCHER_TYPE_NAME: Record<VoucherTypeId, string> = { 1: "ORIGINAL", 2: "DUPLICATE" };

/** The digits of "125-A" -> "125". */
export const voucherDigits = (no: string) => no.replace(/-[AB]$/i, "");
