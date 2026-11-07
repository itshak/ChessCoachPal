import { createClient } from "@/lib/supabase/server";
import { AgentConnections } from "@/components/teacher/AgentConnections";
import Link from "next/link";
export const metadata = { title: "AI connections" };
export default async function Page() {
  const db = await createClient();
  const {data:{user}}=await db.auth.getUser();
  if (!user) return null;
  return <main className="max-w-xl mx-auto space-y-4">
    <h1 className="text-2xl font-bold">ChatGPT and Claude connections</h1>
    <p>Disconnect a tool client at any time. Revocation stops future tool calls immediately.</p>
    <AgentConnections />
    <Link href="/account" className="underline">Back to account settings</Link>
  </main>;
}
