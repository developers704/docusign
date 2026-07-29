import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const stampPath = join(process.cwd(), "BUILD_STAMP.txt");
  let buildStamp = "unknown";
  if (existsSync(stampPath)) {
    buildStamp = readFileSync(stampPath, "utf8").trim() || "unknown";
  }

  return NextResponse.json({
    ok: true,
    app: "valliani-agreements-cloud",
    buildStamp,
    features: {
      signerLocalTimeOnCertificate: true,
      professionalCertificateLayout: true,
      certificateLayoutVersion: 2,
      homeAgreementActivityCorrect: true,
      correctOpensRecipientsForEmailEdit: true,
      signerRolesNumbered: true,
      prepareSigningOrderSummary: true,
      prefillUsesSelectedSigner: true,
      homeSigningProgressChartRemoved: true,
      signScrollToEndManualConsent: true,
    },
    note: "If buildStamp is unknown or old, the new ZIP was not extracted over the Node app root. Restart Node.js after extract. Keep server data/ and storage/ — do not overwrite those with zip copies if you want live documents.",
  });
}
