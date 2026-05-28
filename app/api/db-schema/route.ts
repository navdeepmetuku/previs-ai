/**
 * /api/db-schema — Returns the SQL needed to provision the Supabase table.
 *
 * Used by ModelSettingsPanel to render an inline copy-and-run helper when
 * the table is missing. Keeps `lib/supabase/schema.sql` as the single source
 * of truth and avoids hard-coding the SQL into the React client bundle.
 */

import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const file = path.join(process.cwd(), "lib", "supabase", "schema.sql");
    const sql  = await fs.readFile(file, "utf8");

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    // Extract project ref from URL (https://<ref>.supabase.co)
    const match = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/);
    const projectRef = match?.[1] ?? "";
    const sqlEditorUrl = projectRef
      ? `https://supabase.com/dashboard/project/${projectRef}/sql/new`
      : null;

    return Response.json({
      sql,
      sqlEditorUrl,
      projectRef,
    });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
