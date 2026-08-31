// Back-compat shim: the combobox moved to @/lib/Combobox so vendors and other
// pickers can share it. Existing imports keep working; new code should import
// SearchCombobox from @/lib/Combobox directly.

export { SearchCombobox as BusinessCombobox, type ComboboxOption } from "@/lib/Combobox";
