import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {teacherCalendarFeedRotate,CalendarFeedTokenError} from "@/lib/server/teacher-calendar-feed-service";

/**
 * Rotate the teacher's calendar-feed token. The old feed URL stops working
 * immediately — this is the revocation mechanism the feed token has.
 */
export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try{
    return NextResponse.json(await teacherCalendarFeedRotate(supabase,user.id,true),{
      headers:{"Cache-Control":"no-store"},
    });
  }catch(error){
    return NextResponse.json({error:"Calendar token rotation unavailable"},{
      status:error instanceof CalendarFeedTokenError?error.status:500,
    });
  }
}
