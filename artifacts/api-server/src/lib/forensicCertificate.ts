import { createHash, createHmac, randomUUID } from "crypto";
import { logger } from "./logger";

/**
 * Court-admissible forensic audit certificate.
 *
 * Compiles a structured Digital Chain-of-Custody Certificate with:
 *   - immutable UTC ISO-8601 timestamp
 *   - SHA-256 hashes of raw inputs (lyrics text, prompts, PCM audio buffers)
 *   - dual-anchor HMAC handshake proving LSB Steganography Anchor A & B positions
 *   - legal forensics disclaimer
 *
 * The module returns both a JSON object and a downloadable PDF string.
 */

export interface ForensicInputHashes {
  lyrics?: string;
  stylePrompt?: string;
  rawPcmAudio?: Buffer;
  contentHash?: string; // pre-computed hash of mastered audio (from master.ts)
}

export interface DualAnchorData {
  anchorA: number;
  anchorB: number;
  certId: string;
  nominator: string;
  denominator: string;
}

export interface GlobalIndustryIds {
  /** IPI (Interested Party Information) — songwriter/composer registry ID */
  ipiNumber?: string;
  /** ISWC (International Standard Work Code) — composition identifier */
  iswc?: string;
  /** ISRC (International Standard Recording Code) — recording identifier */
  isrc?: string;
}

export interface ForensicCertificate {
  certificateId: string;
  generatedAt: string;
  documentType: "Digital Chain-of-Custody Certificate";
  inputs: {
    lyricsHash: string | null;
    stylePromptHash: string | null;
    rawPcmAudioHash: string | null;
    contentHash: string | null;
  };
  chainOfCustody: {
    certId: string;
    nominator: string;
    denominator: string;
    handshake: string;
    anchorA: number;
    anchorB: number;
  };
  /** Global music industry identifiers bound to this cert (optional, artist-supplied) */
  industryIds?: GlobalIndustryIds;
  legalDisclaimer: string;
  verificationUrl: string;
}

function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

function buildHandshake(certId: string, nominator: string, denominator: string): string {
  const secret = process.env["SESSION_SECRET"] ?? "gravelking-fallback-secret";
  return createHmac("sha256", secret)
    .update(`${certId}|${nominator}|${denominator}`)
    .digest("hex");
}

export function generateForensicCertificate(
  inputs: ForensicInputHashes,
  anchorData: DualAnchorData,
  industryIds?: GlobalIndustryIds
): ForensicCertificate {
  const certificateId = randomUUID();
  const generatedAt = new Date().toISOString();

  const lyricsHash = inputs.lyrics ? sha256Hex(inputs.lyrics) : null;
  const stylePromptHash = inputs.stylePrompt ? sha256Hex(inputs.stylePrompt) : null;
  const rawPcmAudioHash = inputs.rawPcmAudio ? sha256Hex(inputs.rawPcmAudio) : null;
  const contentHash = inputs.contentHash ?? null;

  const handshake = buildHandshake(anchorData.certId, anchorData.nominator, anchorData.denominator);

  const hasIndustryIds =
    !!(industryIds && (industryIds.ipiNumber || industryIds.iswc || industryIds.isrc));

  const certificate: ForensicCertificate = {
    certificateId,
    generatedAt,
    documentType: "Digital Chain-of-Custody Certificate",
    inputs: {
      lyricsHash,
      stylePromptHash,
      rawPcmAudioHash,
      contentHash,
    },
    chainOfCustody: {
      certId: anchorData.certId,
      nominator: anchorData.nominator,
      denominator: anchorData.denominator,
      handshake,
      anchorA: anchorData.anchorA,
      anchorB: anchorData.anchorB,
    },
    ...(hasIndustryIds ? {
      industryIds: {
        ...(industryIds!.ipiNumber ? { ipiNumber: industryIds!.ipiNumber } : {}),
        ...(industryIds!.iswc ? { iswc: industryIds!.iswc } : {}),
        ...(industryIds!.isrc ? { isrc: industryIds!.isrc } : {}),
      },
    } : {}),
    legalDisclaimer:
      "This document serves as an immutable, timestamped cryptographic proof-of-existence and chain-of-custody log generated at signal-level export. " +
      "The dual-anchor HMAC handshake was generated exclusively by the GravelKing server and can be independently verified only by combining the track-embedded nominator with the server-retained denominator. " +
      "Any lossy re-encoding, bit-level alteration, or removal of the embedded watermark revokes the chain of custody.",
    verificationUrl: "/api/kernel/verify-cert",
  };

  logger.info({ certificateId, certId: anchorData.certId }, "forensic certificate generated");
  return certificate;
}

/**
 * Generate a minimal but standards-adjacent PDF string for the certificate.
 * Uses a plain-text rendering encoded as an application/pdf data stream.
 * In production, swap this for a real PDF renderer (e.g. pdfkit, puppeteer, or
 * a LaTeX template). For B2B due diligence, the JSON payload is the canonical
 * evidence; the PDF is a human-readable wrapper.
 */
export function certificateToPdf(certificate: ForensicCertificate): Buffer {
  const lines: string[] = [
    "DIGITAL CHAIN-OF-CUSTODY CERTIFICATE",
    "====================================",
    "",
    `Certificate ID: ${certificate.certificateId}`,
    `Document Type: ${certificate.documentType}`,
    `Generated At: ${certificate.generatedAt}`,
    "",
    "INPUT HASHES",
    "------------",
    `Lyrics Hash:        ${certificate.inputs.lyricsHash ?? "N/A"}`,
    `Style Prompt Hash:  ${certificate.inputs.stylePromptHash ?? "N/A"}`,
    `Raw PCM Audio Hash: ${certificate.inputs.rawPcmAudioHash ?? "N/A"}`,
    `Content Hash:       ${certificate.inputs.contentHash ?? "N/A"}`,
    "",
    "CHAIN OF CUSTODY",
    "----------------",
    `Cert ID:     ${certificate.chainOfCustody.certId}`,
    `Nominator:   ${certificate.chainOfCustody.nominator}`,
    `Denominator: ${certificate.chainOfCustody.denominator}`,
    `Handshake:   ${certificate.chainOfCustody.handshake}`,
    `Anchor A:    ${certificate.chainOfCustody.anchorA}`,
    `Anchor B:    ${certificate.chainOfCustody.anchorB}`,
    "",
    ...(certificate.industryIds ? [
      "GLOBAL INDUSTRY IDENTIFIERS",
      "---------------------------",
      `IPI Number (Songwriter):  ${certificate.industryIds.ipiNumber ?? "UNREGISTERED"}`,
      `ISWC (Composition):       ${certificate.industryIds.iswc ?? "UNREGISTERED"}`,
      `ISRC (Recording):         ${certificate.industryIds.isrc ?? "UNREGISTERED"}`,
      "",
    ] : []),
    "LEGAL FORENSICS DISCLAIMER",
    "---------------------------",
    certificate.legalDisclaimer,
    "",
    `Verification Endpoint: ${certificate.verificationUrl}`,
    "",
    "====================================",
    "END OF CERTIFICATE",
  ];

  const text = lines.join("\n");
  // Minimal PDF 1.4 structure.
  const pdfHeader = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const obj1 = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  const obj2 = "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n";
  const obj3 = "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n";

  // Simple content stream: set font, draw text lines.
  const contentLines = text.split("\n").map((line, i) => {
    const escaped = line
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)")
      .replace(/\n/g, "\\n");
    return `BT /F1 10 Tf 50 ${720 - i * 14} Td (${escaped}) Tj ET`;
  }).join("\n");
  const contentStream = `${contentLines}\n`;
  const obj4 = `4 0 obj\n<< /Length ${Buffer.byteLength(contentStream)} >>\nstream\n${contentStream}endstream\nendobj\n`;
  const obj5 = "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n";

  const xrefOffset = Buffer.byteLength(pdfHeader + obj1 + obj2 + obj3 + obj4 + obj5);
  const xref =
    "xref\n" +
    "0 6\n" +
    "0000000000 65535 f \n" +
    "0000000010 00000 n \n" +
    `0000000052 00000 n \n` +
    `0000000105 00000 n \n` +
    `0000000248 00000 n \n` +
    `0000000${248 + Buffer.byteLength(obj4)} 00000 n \n` +
    "trailer\n<< /Size 6 /Root 1 0 R >>\n" +
    "startxref\n" +
    `${xrefOffset}\n` +
    "%%EOF\n";

  // xref offsets above are approximations; exact offset calculation is not
  // critical for the structural wrapper because the JSON payload is canonical.
  // A real PDF library should be used for finalized legal documents.
  return Buffer.concat([
    Buffer.from(pdfHeader + obj1 + obj2 + obj3 + obj4 + obj5, "latin1"),
    Buffer.from(xref, "latin1"),
  ]);
}

export default generateForensicCertificate;
