import { Router, Request, Response } from "express";
import { db, ipCertStubsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateForensicCertificate, certificateToPdf } from "../lib/forensicCertificate";
import { logToolError } from "../lib/errorTracker";
import { logger } from "../lib/logger";

const router = Router();

/**
 * GET /api/court-cert/:certId
 *
 * Returns a court-admissible forensic certificate (JSON) for a completed master.
 */
router.get("/court-cert/:certId", async (req: Request, res: Response) => {
  const certId = Array.isArray(req.params.certId) ? req.params.certId[0] : req.params.certId;
  try {
    const [stub] = await db.select().from(ipCertStubsTable).where(eq(ipCertStubsTable.certId, certId));
    if (!stub) {
      res.status(404).json({ success: false, error: "Certificate not found." });
      return;
    }

    const certificate = generateForensicCertificate(
      {
        contentHash: stub.contentHash,
        stylePrompt: stub.stylePrompt ?? undefined,
      },
      {
        certId: stub.certId,
        nominator: stub.denominator.slice(0, 32), // reconstruct from stub for cert display
        denominator: stub.denominator,
        anchorA: 0,
        anchorB: 0,
      }
    );

    // Override the chain-of-custody values to match the real stub exactly.
    certificate.chainOfCustody.nominator = stub.denominator.slice(0, 32);
    certificate.chainOfCustody.denominator = stub.denominator;
    certificate.chainOfCustody.handshake = stub.handshake;

    res.json({ success: true, certificate });
  } catch (err) {
    logger.error({ err, certId }, "failed to generate court certificate");
    void logToolError("Court Certificate", "CERTIFICATE_GENERATION", err);
    res.status(500).json({ success: false, error: "Failed to generate court certificate." });
  }
});

/**
 * GET /api/court-cert/:certId.pdf
 *
 * Downloads a PDF rendering of the forensic certificate.
 */
router.get("/court-cert/:certId.pdf", async (req: Request, res: Response) => {
  const certId = Array.isArray(req.params.certId) ? req.params.certId[0] : req.params.certId;
  try {
    const [stub] = await db.select().from(ipCertStubsTable).where(eq(ipCertStubsTable.certId, certId));
    if (!stub) {
      res.status(404).json({ success: false, error: "Certificate not found." });
      return;
    }

    const certificate = generateForensicCertificate(
      {
        contentHash: stub.contentHash,
        stylePrompt: stub.stylePrompt ?? undefined,
      },
      {
        certId: stub.certId,
        nominator: stub.denominator.slice(0, 32),
        denominator: stub.denominator,
        anchorA: 0,
        anchorB: 0,
      }
    );
    certificate.chainOfCustody.nominator = stub.denominator.slice(0, 32);
    certificate.chainOfCustody.denominator = stub.denominator;
    certificate.chainOfCustody.handshake = stub.handshake;

    const pdf = certificateToPdf(certificate);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="gravelking-cert-${certId}.pdf"`);
    res.send(pdf);
  } catch (err) {
    logger.error({ err, certId }, "failed to generate court certificate PDF");
    void logToolError("Court Certificate PDF", "CERTIFICATE_GENERATION", err);
    res.status(500).json({ success: false, error: "Failed to generate court certificate PDF." });
  }
});

export default router;
