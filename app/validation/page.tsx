import type { Metadata } from "next";
import { ValidationView } from "@/components/ValidationView";

export const metadata: Metadata = { title: "Validation · Lunar Site Navigator" };

export default function ValidationPage() {
  return <ValidationView />;
}
