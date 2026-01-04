export const runtime = "nodejs";

export async function GET() {
  return Response.json({ ok: true, service: "month-end-dashboard-web" });
}

