import type { ReactNode } from "react";
import { InventoryShell } from "@/components/inventory-context";

export default function InventoryLayout({ children }: { children: ReactNode }) {
  return <InventoryShell>{children}</InventoryShell>;
}
