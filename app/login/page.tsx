import { getDeploymentMode, requiresBetaCode } from "@/lib/entitlements";
import {getTranslations} from "next-intl/server";
import { LoginForm } from "@/components/auth/LoginForm";

export async function generateMetadata(){
  const t=await getTranslations("login");
  return {title:t("title")};
}

export default function LoginPage() {
  const hosted = getDeploymentMode() === "hosted";
  return (
    <LoginForm
      betaRequired={requiresBetaCode()}
      showLegalLinks={hosted}
      isHosted={hosted}
    />
  );
}
