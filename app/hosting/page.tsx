import Link from "next/link";
import { Card } from "@/components/ui/card";
export const metadata = { title: "Hosting" };
export default function HostingPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-3">Host ChessCoachPal your way</h1>
      <p className="text-muted mb-6">ChessCoachPal is a self-hostable, open-source chess teacher assistant. Core student, family, coaching and learning workflows run in your own environment, with no mandatory external AI provider.</p>
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <Card>
          <h2 className="text-lg font-semibold mb-2">Self-host</h2>
          <p className="text-sm text-muted">Own the application, database, secrets, and backups. No hosted student limits.</p>
          <a className="text-primary hover:underline text-sm" href="https://github.com/itshak/ChessCoachPal">Source and setup instructions</a>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold mb-2">Optional hosted deployment</h2>
          <p className="text-sm text-muted">Optional hosted features are controlled by the installation operator and are not required for self-hosting. Check your account page for availability and terms on a specific server.</p>
          <Link href="/account" className="text-primary hover:underline text-sm">Account settings</Link>
        </Card>
      </div>
      <p className="text-sm text-muted">Do not point development tests or database reset commands at production databases. Real ChatGPT and Claude interoperability is verified locally at the final v0.1.0 release gate.</p>
    </main>
  );
}
