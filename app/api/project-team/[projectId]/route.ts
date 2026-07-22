import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isLocalDbMode, updateProject } from "@/lib/local-db";
import { getCurrentAppUser } from "@/lib/current-user";
import type { ProjectTeamMember } from "@/lib/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await getCurrentAppUser();
    if (!user || (user.role !== "Admin" && user.role !== "Cost Controller" && user.role !== "Project Manager")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { projectId } = await params;
    const { assigned_users } = (await request.json()) as {
      assigned_users: ProjectTeamMember[];
    };

    if (await isLocalDbMode()) {
      await updateProject(projectId, { assigned_users });
      return NextResponse.json({ ok: true });
    }

    const supabase = await createSupabaseAdminClient();
    const { error } = await supabase
      .from("projects")
      .update({ assigned_users })
      .eq("id", projectId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save team" },
      { status: 500 },
    );
  }
}
