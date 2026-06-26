import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// One shared, natural-order collator. Reusing a single Intl.Collator is an order of
// magnitude faster than calling String.localeCompare per comparison — which matters
// when sorting a library of tens or hundreds of thousands of titles on the main
// thread. `compareNames` is the drop-in comparator used by every A→Z/Z→A sort.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
export function compareNames(a: string, b: string): number {
  return collator.compare(a, b);
}
