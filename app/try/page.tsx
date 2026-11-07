import Link from "next/link";
import { Card } from "@/components/ui/card";
export const metadata = { title: "Try ChessCoachPal" };
export default function TryPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-3">Try ChessCoachPal</h1>
      <p className="text-muted mb-6">A chess teacher's workspace for students, coaching groups, lesson attendance, teaching notes, and chess skill observations.</p>
      <Card>
        <h2 className="font-semibold mb-2">Start with a self-hosted workspace</h2>
        <p className="text-sm text-muted mb-4">Sign in to an installation, connect your ChatGPT or Claude client with delegated OAuth, or use the full browser interface. All coaching data belongs to your authenticated teacher account.</p>
        <div className="flex gap-4 flex-wrap">
          <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link>
          <Link href="/hosting" className="font-medium text-primary hover:underline">Hosting options</Link>
        </div>
      </Card>
      <p className="text-xs text-muted mt-5">No sample learner data or public live practice tokens are served by this page.</p>
    </main>
  );
}
