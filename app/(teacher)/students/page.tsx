import {getTranslations} from "next-intl/server";
import {StudentDirectory} from "./StudentDirectory";

export async function generateMetadata(){
  const t=await getTranslations("students");return {title:t("title")};
}

export default function StudentsPage({searchParams}:{searchParams:Promise<{show?:string;q?:string}>}){
  return <StudentDirectory searchParams={searchParams}/>;
}
