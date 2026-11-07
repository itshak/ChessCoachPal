import type { Metadata } from "next";
export const metadata: Metadata = { title: "Privacy and data ownership" };

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl space-y-6 text-sm leading-relaxed">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Privacy and data ownership</h1>
        <p className="text-muted">ChessCoachPal is open-source chess coaching software. This describes the software, not the privacy policy of an unspecified hosting operator.</p>
      </header>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Who operates your installation?</h2>
        <p>The teacher or organization running your instance controls its hosting, database, backups, logs, retention period, email delivery, optional payments and connected AI providers. ChessCoachPal contributors do not automatically receive records stored on independent installations. Contact your hosting operator for their privacy notice and privacy-request details.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">What can be stored?</h2>
        <p>The application can store teacher accounts, workplaces, students and family contacts, birth dates, lesson schedules, attendance, private and shared coaching notes, chess learning observations and study links, invoices and payment records. Family portals are accessible to anyone with their private portal link; protect and rotate these links when necessary.</p>
        <p>Session cookies authenticate teachers. Delegated AI clients receive teacher-authorized OAuth permissions. Optional email, payments, AI and other integrations can send information to providers selected by the operator or teacher. Never expose a service-role database key to a client or AI agent.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Children and sensitive records</h2>
        <p>Teachers and operators must obtain applicable permissions, restrict access, handle correction and deletion requests, and meet their legal child-privacy obligations. Do not enter identifiable real students, personal records or production credentials in public demo or CI environments.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Retention, export and security</h2>
        <p>Teachers can export records from Account settings. Exports contain sensitive information and need separate protection. Operators must manage database and uploaded-object backups, retention, deletion and incident response. No hosting-region, retention period, contact address or contractual guarantee is implied by this open-source repository.</p>
        <p>See the <a className="text-primary underline" href="https://github.com/itshak/ChessCoachPal/blob/main/docs/SECURITY.md">security documentation</a> for implementation guidance, and ask your deployment operator about their actual practices.</p>
      </section>
    </article>
  );
}
