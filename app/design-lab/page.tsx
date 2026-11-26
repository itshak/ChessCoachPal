import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DesignLab } from "./workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Design laboratory", robots: { index: false, follow: false } };

export default function DesignLabPage() {
  if (process.env.CHESSCOACHPAL_DESIGN_LAB !== "1") notFound();
  return <DesignLab />;
}
