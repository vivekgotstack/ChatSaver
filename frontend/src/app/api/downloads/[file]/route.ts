import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RELEASE = "0.2.2";
const FILES = {
  "ChatSaver.exe": "application/vnd.microsoft.portable-executable",
  "ChatSaver.dmg": "application/x-apple-diskimage",
} as const;

async function releaseAsset(file: string, method: "GET" | "HEAD") {
  return fetch(
    `https://github.com/vivekgotstack/ChatSaver/releases/download/${RELEASE}/${file}`,
    { method, cache: "no-store" },
  );
}

export async function HEAD(
  _request: Request,
  context: { params: Promise<{ file: string }> },
) {
  const { file } = await context.params;
  if (!FILES[file as keyof typeof FILES]) return new NextResponse(null, { status: 404 });
  const asset = await releaseAsset(file, "HEAD");
  return new NextResponse(null, {
    status: asset.ok ? 204 : 503,
    headers: asset.ok ? undefined : { "Retry-After": "30" },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ file: string }> },
) {
  const { file } = await context.params;
  const contentType = FILES[file as keyof typeof FILES];
  if (!contentType) return new NextResponse("Installer not found.", { status: 404 });

  const asset = await releaseAsset(file, "GET");
  if (!asset.ok || !asset.body) {
    return new NextResponse("The new installer is still being prepared. Try again shortly.", {
      status: 503,
      headers: { "Retry-After": "60" },
    });
  }

  return new NextResponse(asset.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "public, s-maxage=300",
    },
  });
}
