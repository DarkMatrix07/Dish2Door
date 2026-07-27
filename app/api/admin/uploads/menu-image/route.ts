import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireApiRole } from "@/lib/auth";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
// Uploads used to be written byte-for-byte, so phone photos of 3-5 MB were served
// straight to customers on the menu. Menu images never render wider than ~600 CSS px,
// so re-encode every upload to a bounded WebP — typically a 20-40x size reduction.
const MAX_STORED_WIDTH = 1200;
const WEBP_QUALITY = 76;

// Detect the real image type from the file's magic bytes rather than trusting
// the client-supplied MIME, so a non-image (e.g. an HTML/SVG payload) can't be
// written into /public with an image extension.
function sniffImageExtension(bytes: Buffer): "jpg" | "png" | "webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export async function POST(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Image file is required" }, { status: 400 });
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: "Image must be 5 MB or smaller" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = sniffImageExtension(bytes);
  if (!extension) {
    return NextResponse.json({ error: "Only JPG, PNG, and WebP images are allowed" }, { status: 400 });
  }

  // The magic-byte sniff above already proved this is a real raster image; sharp then
  // re-encodes it, which also strips EXIF (including any GPS data from a phone photo).
  let optimised: Buffer;
  try {
    optimised = await sharp(bytes)
      .rotate() // honour EXIF orientation before that metadata is dropped
      .resize({ width: MAX_STORED_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "That image could not be processed. Try a different file." }, { status: 400 });
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "menu");
  const fileName = `${Date.now()}-${randomUUID()}.webp`;

  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, fileName), optimised);

  return NextResponse.json({ imageUrl: `/uploads/menu/${fileName}` });
}
