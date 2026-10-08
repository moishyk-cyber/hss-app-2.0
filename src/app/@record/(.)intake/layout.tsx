import { RecordDrawer } from "@/lib/RecordDrawer";
import type { ReactNode } from "react";

export default function RecordPanelLayout({ children }: { children: ReactNode }) {
  return <RecordDrawer>{children}</RecordDrawer>;
}
