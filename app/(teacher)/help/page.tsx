import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {Card} from "@/components/ui/card";

const sections = [
  {id:1,href:"/coaching"},{id:2,href:"/students"},{id:3,href:"/coaching"},
  {id:4,href:"/learning"},{id:5,href:"/ai-connections"},{id:6,href:"/account"}
] as const;
export async function generateMetadata(){
  const t=await getTranslations("help");
  return {title:t("title")};
}
export default async function HelpPage() {
  const t=await getTranslations("help");
  return <div className="max-w-4xl mx-auto">
    <h1 className="text-2xl font-bold mb-2">{t("title")}</h1>
    <p className="text-muted mb-7">{t("lead")}</p>
    <div className="grid gap-4 md:grid-cols-2">
      {sections.map(({id,href})=>{
        const title=t(("section"+id+"Title") as "section1Title");
        return <Card key={id} padding="sm">
          <h2 className="font-semibold mb-2">{title}</h2>
          <p className="text-sm text-muted mb-3">{t(("section"+id+"Description") as "section1Description")}</p>
          <Link href={href} className="text-sm font-semibold text-primary hover:underline">{t(("section"+id+"Action") as "section1Action")}</Link>
        </Card>;
      })}
    </div>
    <p className="text-sm text-muted mt-8">{t("release")}</p>
  </div>;
}
