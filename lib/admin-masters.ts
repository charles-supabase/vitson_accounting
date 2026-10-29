// Configuration of the Administration master-data forms (pure data, used by the server and the client).
// One entry per table: the form fields, in order, and where the dropdown / check-box options come from.

export type FieldType = "text" | "email" | "int" | "numeric" | "bool" | "select" | "multi";

/** Where the options of a select / multi field come from. */
export type OptionSource = {
  table: string;
  valueCol: string; // stored value
  labelCol: string; // shown text
  suffixCol?: string; // shown in brackets after the text
  notEmpty?: boolean; // leave out rows whose value is empty
};

export type MasterField = {
  name: string; // database column
  label: string;
  type: FieldType;
  required?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
  hint?: string;
  defaultValue?: string;
  options?: OptionSource;
};

export type MasterConfig = {
  slug: string;
  table: string;
  title: string; // list / page heading
  singular: string; // "bank" in "Add bank"
  description: string;
  group: "Purchasing" | "Accounting" | "Sales and production";
  fields: MasterField[];
};

const list: MasterConfig[] = [
  {
    slug: "suppliers", table: "tbl_Supplier", title: "Suppliers", singular: "supplier", group: "Purchasing",
    description: "Supplier master list",
    fields: [
      { name: "Supplier_Name", label: "Supplier name", type: "text", required: true },
      { name: "Contact_Person", label: "Contact person", type: "text" },
      { name: "Email", label: "Email", type: "email" },
      { name: "Phone", label: "Phone", type: "int", placeholder: "numbers only" },
      { name: "supplier_TIN", label: "Supplier TIN", type: "int", placeholder: "numbers only" },
      { name: "Acc_Book_id", label: "Account book", type: "select", options: { table: "tbl_Acc_Book", valueCol: "id", labelCol: "Book_Name" } },
      { name: "Acc_Category_id", label: "Account category", type: "select", options: { table: "tbl_Acc_Category", valueCol: "id", labelCol: "Acc_Category_Name" } },
      { name: "discount_percent", label: "Discount %", type: "numeric", min: 0, max: 100, placeholder: "e.g. 2.5" },
      { name: "terms", label: "Terms (days)", type: "int", placeholder: "e.g. 30" },
    ],
  },
  {
    slug: "items", table: "tbl_Item", title: "Items", singular: "item", group: "Purchasing",
    description: "Item master list",
    fields: [
      { name: "item_name", label: "Item name", type: "text", required: true },
      { name: "Price", label: "Price", type: "numeric", required: true, min: 0 },
      { name: "bound_id", label: "Bound", type: "select", required: true, options: { table: "tbl_Item_Bound", valueCol: "id", labelCol: "bound_name" } },
      { name: "Shade_id", label: "Shade", type: "select", options: { table: "tbl_Shade_Classification", valueCol: "id", labelCol: "Shade_name" } },
    ],
  },
  {
    slug: "item-bounds", table: "tbl_Item_Bound", title: "Item bounds", singular: "item bound", group: "Purchasing",
    description: "Item bound (category) names and their sorting",
    fields: [
      { name: "bound_name", label: "Bound name", type: "text", required: true },
      { name: "sorting_id", label: "Sorting", type: "select", options: { table: "tbl_Item_Sorting", valueCol: "id", labelCol: "sorting_name" } },
    ],
  },
  {
    slug: "item-sortings", table: "tbl_Item_Sorting", title: "Item sortings", singular: "item sorting", group: "Purchasing",
    description: "Sorting groups for item bounds",
    fields: [{ name: "sorting_name", label: "Sorting name", type: "text", required: true }],
  },
  {
    slug: "payables", table: "tbl_payables", title: "Payables", singular: "payable", group: "Purchasing",
    description: "Payable names",
    fields: [{ name: "payable_names", label: "Payable name", type: "text", required: true }],
  },
  {
    slug: "banks", table: "tbl_Bank", title: "Banks", singular: "bank", group: "Accounting",
    description: "Banks and whether they are active",
    fields: [
      { name: "bank_name", label: "Bank name", type: "text", required: true },
      { name: "active", label: "Active", type: "bool", defaultValue: "true" },
    ],
  },
  {
    slug: "acc-books", table: "tbl_Acc_Book", title: "Account books", singular: "account book", group: "Accounting",
    description: "Account book numbers and names",
    fields: [
      { name: "Book_Number", label: "Book number", type: "text", required: true, placeholder: "e.g. 101-B" },
      { name: "Book_Name", label: "Book name", type: "text", required: true },
    ],
  },
  {
    slug: "acc-categories", table: "tbl_Acc_Category", title: "Account categories", singular: "account category", group: "Accounting",
    description: "Account category names",
    fields: [{ name: "Acc_Category_Name", label: "Category name", type: "text", required: true }],
  },
  {
    slug: "acc-sortings", table: "tbl_Acc_Sorting", title: "Account sortings", singular: "account sorting", group: "Accounting",
    description: "Account sorting names and their book code",
    fields: [
      { name: "Sort_name", label: "Sorting name", type: "text", required: true },
      { name: "sort_book", label: "Sort book", type: "text", placeholder: "e.g. 101" },
    ],
  },
  {
    slug: "customers", table: "tbl_Customer", title: "Customers", singular: "customer", group: "Sales and production",
    description: "Customer master list",
    fields: [
      { name: "customer_name", label: "Customer name", type: "text", required: true },
      { name: "customer_no", label: "Customer no.", type: "text", hint: "Aliases are linked to customers by this number. Changing it unlinks the customer from its aliases." },
      { name: "address", label: "Address", type: "text" },
      { name: "customer_TIN", label: "Customer TIN", type: "int", placeholder: "numbers only" },
      { name: "default_alias_id", label: "Default alias", type: "select", options: { table: "tbl_Alias", valueCol: "id", labelCol: "alias_name" } },
      { name: "discounts_rate", label: "Discount rate %", type: "numeric", min: 0, max: 100, placeholder: "e.g. 5" },
    ],
  },
  {
    slug: "aliases", table: "tbl_Alias", title: "Aliases", singular: "alias", group: "Sales and production",
    description: "Alias names, TIN, address and the customers linked to each",
    fields: [
      { name: "alias_name", label: "Alias name", type: "text", required: true },
      { name: "TIN_number", label: "TIN", type: "int", required: true, placeholder: "numbers only" },
      { name: "alias_address", label: "Address", type: "text", required: true },
      {
        name: "associated_customer", label: "Associated customers", type: "multi",
        hint: "Stored as the customer numbers separated by commas.",
        options: { table: "tbl_Customer", valueCol: "customer_no", labelCol: "customer_name", suffixCol: "customer_no", notEmpty: true },
      },
    ],
  },
  {
    slug: "fabrics", table: "tbl_Fabric", title: "Fabrics", singular: "fabric", group: "Sales and production",
    description: "Fabric names",
    fields: [{ name: "fabric_name", label: "Fabric name", type: "text", required: true }],
  },
  {
    slug: "dye-processes", table: "tbl_dye_process_type", title: "Dye processes", singular: "dye process", group: "Sales and production",
    description: "Dye process types",
    fields: [{ name: "dye_process_name", label: "Dye process name", type: "text", required: true }],
  },
  {
    slug: "tones", table: "tbl_tone", title: "Tones", singular: "tone", group: "Sales and production",
    description: "Tone names and codes",
    fields: [
      { name: "tone_name", label: "Tone name", type: "text", required: true },
      { name: "tone_code", label: "Tone code", type: "text" },
    ],
  },
];

export const MASTERS: Record<string, MasterConfig> = Object.fromEntries(list.map((c) => [c.slug, c]));
export const MASTER_LIST = list;
