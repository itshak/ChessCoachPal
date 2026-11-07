import Link from "next/link";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Help" };

const sections = [
  {
    title: "Start coaching",
    description: "Create a workplace for each school, chess club, online group or private teaching practice. Each workplace has its own timezone and policies.",
    href: "/coaching",
    action: "Open coaching",
  },
  {
    title: "Students and families",
    description: "Add students, keep private teaching notes and optionally connect families to a private portal for their schedule, invoices and shared notes.",
    href: "/students",
    action: "Manage students",
  },
  {
    title: "Classes, lessons and attendance",
    description: "Create class groups and enroll students, or schedule individual lessons. The session roster is frozen at creation, so attendance history remains accurate even when group membership changes. Record each student's attendance independently.",
    href: "/coaching",
    action: "Manage classes and lessons",
  },
  {
    title: "Chess learning",
    description: "Track chess skill observations, review suggestions made by AI agents, and save curated HTTPS or Lichess Study links. Suggestions are unverified until you explicitly approve them in the website.",
    href: "/learning",
    action: "Open chess learning",
  },
  {
    title: "Connect an AI assistant",
    description: "Connect a supported ChatGPT or Claude client through delegated OAuth and MCP. Agent actions are scoped to your teacher account and never receive a service-role key. Live client interoperability is reserved for final v0.1.0 release acceptance.",
    href: "/ai-connections",
    action: "Review AI connections",
  },
  {
    title: "Account and hosting",
    description: "Configure your profile, notifications and optional services. ChessCoachPal is self-hostable. Back up both your PostgreSQL database and any uploaded objects before resetting or replacing a development installation.",
    href: "/account",
    action: "Account settings",
  },
] as const;

export default function HelpPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">ChessCoachPal help</h1>
      <p className="text-muted mb-7">
        The website works without an AI subscription. Use it for review, corrections and all core teacher workflows.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title} padding="sm">
            <h2 className="font-semibold mb-2">{section.title}</h2>
            <p className="text-sm text-muted mb-3">{section.description}</p>
            <Link href={section.href} className="text-sm font-semibold text-primary hover:underline">{section.action}</Link>
          </Card>
        ))}
      </div>
      <p className="text-sm text-muted mt-8">
        Before publishing v0.1.0, follow the release gate and test both real ChatGPT and Claude clients against a locally managed synthetic instance.
      </p>
    </div>
  );
}
