import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";

const features = [
  ["Agent-first teaching records", "Record lessons, attendance and notes with connected ChatGPT or Claude tools as they become available."],
  ["Students and groups", "Track individual and group teaching with one record per student."],
  ["Workplaces and schedules", "See your lessons across schools, clubs and private practice."],
  ["Your data, your control", "Self-host, review and correct records on the website even without AI."],
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 font-bold text-lg text-primary">
            <BrandMark size={36} className="h-9 w-9" alt="" />
            ChessCoachPal
          </Link>
          <Link href="/login" className="rounded-lg bg-primary text-white px-4 py-2 text-sm font-semibold">Teacher login</Link>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-5 py-14">
        <section className="max-w-3xl space-y-5">
          <p className="font-semibold text-primary">Your friendly chess-coaching assistant</p>
          <h1 className="font-bold text-4xl md:text-6xl tracking-tight leading-tight">More time for coaching. Less time on admin.</h1>
          <p className="text-lg text-muted">A free, open-source workspace for chess teachers: students, groups, scheduling, attendance, lesson notes and learning history. Designed around AI-agent input and a dependable website for review and editing.</p>
          <p className="text-sm text-muted">Built on the MIT-licensed CogNote project. Agent integrations and chess-specific workplace features are actively being adapted; see project status before deploying.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/login" className="rounded-lg bg-primary text-white px-5 py-3 font-semibold">Open teacher workspace</Link>
            <a href="https://github.com/itshak/ChessCoachPal" className="rounded-lg border border-border px-5 py-3 font-semibold">Source and documentation</a>
          </div>
        </section>
        <section className="mt-14 grid gap-4 md:grid-cols-2">
          {features.map(([title, detail]) => (
            <article key={title} className="rounded-xl border border-border bg-surface p-5">
              <h2 className="font-semibold text-lg">{title}</h2>
              <p className="text-muted mt-2">{detail}</p>
            </article>
          ))}
        </section>
      </main>
      <footer className="border-t border-border py-6 text-center text-sm text-muted">
        ChessCoachPal · MIT licensed · Based on CogNote by Andres Jaime Morales
      </footer>
    </div>
  );
}
