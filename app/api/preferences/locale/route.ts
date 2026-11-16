import {NextRequest, NextResponse} from "next/server";
import {isAppLocale, localeCookie} from "@/i18n/locales";
/** Public language choice has no account side effects. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !isAppLocale(body.locale)) {
    return NextResponse.json({error: "Unsupported locale"}, {status: 400});
  }
  const response = NextResponse.json({locale: body.locale}, {headers: {"Cache-Control": "no-store"}});
  response.cookies.set(localeCookie, body.locale, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365
  });
  return response;
}
