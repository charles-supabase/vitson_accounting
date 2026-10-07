export type ModuleKey =
  | "requisition"
  | "purchase_order"
  | "receiving"
  | "voucher"
  | "inventory"
  | "accounts_payable"
  | "collection"
  | "bank"
  | "accounts_receivable"
  | "deliveries";

export const MODULES: { key: ModuleKey; label: string; href: string; description: string }[] = [
  {
    key: "requisition",
    label: "Requisition",
    href: "/requisition",
    description: "Raise and approve requests for items",
  },
  {
    key: "purchase_order",
    label: "Purchase Order",
    href: "/purchase-order",
    description: "Create POs from approved requisitions, track deliveries",
  },
  {
    key: "receiving",
    label: "Receiving",
    href: "/receiving",
    description: "Log supplier deliveries and plant receiving",
  },
  {
    key: "voucher",
    label: "Voucher",
    href: "/voucher",
    description: "Build payment vouchers from received items",
  },
  {
    key: "inventory",
    label: "Inventory",
    href: "/inventory",
    description: "Purchases, daily and actual usage, recipe usage, monthly stock",
  },
  {
    key: "accounts_payable",
    label: "Accounts Payable",
    href: "/accounts-payable",
    description: "Amounts still owed to suppliers, by due month",
  },
  {
    key: "collection",
    label: "Collection",
    href: "/collection",
    description: "Customer checks: collect, deposit, monitor due dates",
  },
  {
    key: "bank",
    label: "Bank",
    href: "/bank",
    description: "Checks, DM memos, and bank balances",
  },
  {
    key: "accounts_receivable",
    label: "Accounts Receivable",
    href: "/accounts-receivable",
    description: "Monthly sales per customer against collections",
  },
  {
    key: "deliveries",
    label: "Deliveries",
    href: "/deliveries",
    description: "Record deliveries against job tickets",
  },
];
