# Update 64: Administration forms

New / replaced files (copy over the project, keep the same folders):
- lib/admin-masters.ts            one entry per table (fields, dropdown sources). Add a table here to get a new form.
- actions/admin-masters.ts        saveMaster (add / update, super admin only)
- actions/admin-users.ts          saveUser (add / update user + modules, bcrypt password)
- components/master-manager.tsx   the generic form + double-click listbox
- components/master-page.tsx      server side loader
- components/user-manager.tsx     Users form + listbox
- components/notice-modal.tsx     in-app "Saved successfully" popup (OK button)
- app/admin/[master]/page.tsx     banks, customers, aliases, fabrics, dye-processes, tones, payables,
                                  item-bounds, item-sortings, acc-books, acc-categories, acc-sortings
- app/admin/suppliers/page.tsx, app/admin/items/page.tsx, app/admin/users/page.tsx   (replaced)
- app/admin/layout.tsx, app/admin/page.tsx                                            (replaced)

Not touched: components/supplier-form.tsx, item-form.tsx, user-form.tsx and actions/suppliers.ts, items.ts
(the Requisition quick-add still uses them). user-form.tsx is no longer used by the Users page.

Rules built in
- Every Administration page and every save requires a super admin.
- Unsaved changes: double-clicking another record or "New" asks with the in-app Leave / Stay popup.
- Duplicate names / numbers that the database forbids show a plain message.
- Users: a blank password on edit keeps the current one; a new password is hashed with bcrypt (min 8 characters).
  You cannot deactivate yourself, remove your own super admin right, or remove the last active super admin.
  Only the five modules allowed by the database check (requisition, purchase_order, receiving, voucher, bank) can be ticked.
- Aliases: Associated customers are saved as the customers' Customer no. separated by commas (the format already in tbl_Alias).
