import type { Metadata } from "next";
export const metadata: Metadata = { title: "License and hosting terms" };

export default function TermsPage() {
  return (
    <article className="max-w-3xl space-y-6 text-sm leading-relaxed">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Software license and hosting terms</h1>
        <p className="text-muted">ChessCoachPal is self-hostable open-source chess teaching software, not a hosted service operated by the original CogNote publisher.</p>
      </header>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Open-source license</h2>
        <p>Use, modification and redistribution of the source code are governed by the repository&apos;s MIT <a className="text-primary underline" href="https://github.com/itshak/ChessCoachPal/blob/main/LICENSE">license</a>. Required attribution is preserved in <a className="text-primary underline" href="https://github.com/itshak/ChessCoachPal/blob/main/docs/UPSTREAM.md">upstream credits</a>. This page does not amend the MIT license.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Independent hosting</h2>
        <p>Each installation is run by its own operator. If your chess teacher, school, club or service provider hosts your account, ask them for applicable terms, data practices, pricing, support arrangements and availability. The source repository makes no claim that a specific paid hosting service or central support organization is available.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Responsible use</h2>
        <p>Operators and teachers must obtain appropriate permissions to hold students&apos; and families&apos; records, protect credentials and private links, comply with applicable laws, and check redistribution rights before uploading teaching materials. Optional AI, payments and email services have separate provider terms.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">No implied service contract</h2>
        <p>Installing this software does not create a subscription, hosting agreement, service-level guarantee or legal relationship with its contributors. Separate hosting contracts, if any, are between the user and their chosen operator.</p>
      </section>
    </article>
  );
}
