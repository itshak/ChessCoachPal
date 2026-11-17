import Link from "next/link";
import {getTranslations} from "next-intl/server";

/** Keep this minimal and inline-styled so a PWA can render its cached copy. */
export async function generateMetadata(){
  const t=await getTranslations("offline");
  return {title:t("title")};
}
export default async function OfflinePage(){
  const t=await getTranslations("offline");
  return <main style={{
    minHeight:"100dvh",display:"flex",flexDirection:"column",alignItems:"center",
    justifyContent:"center",gap:"0.75rem",padding:"0 1.5rem",textAlign:"center",
    fontFamily:"system-ui, sans-serif",background:"#faf9f7",color:"#1a1a2e"
  }}>
    <h1 style={{fontSize:"1.125rem",fontWeight:600,margin:0}}>{t("title")}</h1>
    <p style={{fontSize:"0.875rem",color:"#6b7280",maxWidth:"24rem",margin:0}}>{t("detail")}</p>
    <Link href="/" style={{fontSize:"0.875rem",color:"#2a9d8f"}}>{t("retry")}</Link>
  </main>;
}
