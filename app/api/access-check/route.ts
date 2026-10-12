import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { checkSession } from "@/lib/session";
import { getTrustedClientIp } from "@/lib/client-ip";
import { parseOfficeIps } from "@/lib/access-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Admin-only diagnostic: shows the client IP this deployment sees, so you can confirm the
 * office address (and whether it is IPv4 or IPv6) before turning regular users loose.
 * It never reveals the configured OFFICE_PUBLIC_IP value.
 */
export async function GET() {
  const check = await checkSession();
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: check.status, headers: NO_STORE });
  }
  if (check.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  }
  const ip = getTrustedClientIp(await headers());
  const office = parseOfficeIps(process.env.OFFICE_PUBLIC_IP);
  return NextResponse.json(
    {
      detectedIp: ip,
      ipFamily: ip === null ? null : ip.includes(":") ? "IPv6" : "IPv4",
      matchesOfficeIp: ip !== null && office.has(ip),
      officeIpConfigured: office.size > 0,
      runningOnVercel: process.env.VERCEL === "1",
      vercelEnvironment: process.env.VERCEL_ENV ?? null,
    },
    { headers: NO_STORE },
  );
}
