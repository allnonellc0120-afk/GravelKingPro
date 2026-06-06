import { jsPDF } from "jspdf";

export interface ReportData {
  multiplier: number;
  sliceSize: number;
  throughput: string;
  stability: string;
  efficiency: string;
  decayRate: string;
  originalSum: number;
  carvedSum: number;
  parityStatus: "VALIDATED" | "KERNEL_VIOLATION";
  runDate: string;
}

export function generateKernelReport(data: ReportData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const margin = 20;
  const col = margin;
  let y = 0;

  // --- Header band ---
  doc.setFillColor(10, 10, 15);
  doc.rect(0, 0, W, 38, "F");

  doc.setFillColor(245, 158, 11); // amber
  doc.rect(0, 38, W, 1.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text("GRAVELKING", col, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(180, 130, 40);
  doc.text("Morris Law Kernel V2  //  Analysis Report", col, 26);

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 130);
  doc.text(`Generated: ${data.runDate}`, col, 33);

  y = 52;

  // --- Section: Run Parameters ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(245, 158, 11);
  doc.text("RUN PARAMETERS", col, y);
  y += 6;

  doc.setDrawColor(60, 60, 70);
  doc.setLineWidth(0.3);
  doc.line(col, y, W - margin, y);
  y += 6;

  const params: [string, string][] = [
    ["Signal Strength (multiplier)", data.multiplier.toFixed(2)],
    ["Buffer Size (slice_size)", String(data.sliceSize)],
    ["Protocol", "Morris Law Kernel V2"],
    ["Execution Mode", "gravelking_opt(O(N))"],
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  for (const [label, value] of params) {
    doc.setTextColor(140, 140, 155);
    doc.text(label, col, y);
    doc.setTextColor(230, 230, 240);
    doc.text(value, 130, y);
    y += 7;
  }

  y += 4;

  // --- Section: Kernel Output Metrics ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(245, 158, 11);
  doc.text("KERNEL OUTPUT METRICS", col, y);
  y += 6;
  doc.line(col, y, W - margin, y);
  y += 6;

  const metrics: [string, string][] = [
    ["Signal Throughput", data.throughput],
    ["Stability", data.stability],
    ["Efficiency", data.efficiency],
    ["Decay Rate", data.decayRate],
    ["Original Signal Sum", String(data.originalSum)],
    ["Carved Signal Sum", data.carvedSum.toFixed(4)],
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  for (const [label, value] of metrics) {
    doc.setTextColor(140, 140, 155);
    doc.text(label, col, y);
    doc.setTextColor(80, 220, 140);
    doc.text(value, 130, y);
    y += 7;
  }

  y += 4;

  // --- Section: Parity Verification ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(245, 158, 11);
  doc.text("PARITY VERIFICATION", col, y);
  y += 6;
  doc.line(col, y, W - margin, y);
  y += 6;

  const isValid = data.parityStatus === "VALIDATED";
  doc.setFillColor(isValid ? 30 : 60, isValid ? 60 : 20, isValid ? 40 : 20);
  doc.roundedRect(col, y, W - margin * 2, 14, 2, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(isValid ? 80 : 220, isValid ? 220 : 80, isValid ? 140 : 80);
  doc.text(
    isValid ? "PARITY CHECK: VALIDATED" : "PARITY CHECK: KERNEL VIOLATION",
    col + 6,
    y + 9
  );
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 120);
  doc.text(
    "Morris Law Kernel V2 Bitwise Quorum Verification  //  MLK-V2 Parity Algorithm",
    col,
    y
  );
  y += 12;

  // --- Signature block ---
  doc.setFillColor(18, 18, 26);
  doc.rect(col, y, W - margin * 2, 38, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(200, 200, 210);
  doc.text("Kevin Morris", col + 8, y + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 120);
  doc.text("Chief Architect  //  All N One LLC", col + 8, y + 17);

  doc.setDrawColor(60, 60, 70);
  doc.line(col + 8, y + 30, col + 70, y + 30);
  doc.setFontSize(7);
  doc.text("Authorized Signature", col + 8, y + 35);

  y += 46;

  // --- Footer ---
  doc.setFillColor(10, 10, 15);
  doc.rect(0, 282, W, 15, "F");
  doc.setFillColor(245, 158, 11);
  doc.rect(0, 282, W, 0.8, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(90, 90, 100);
  doc.text("GravelKing Productions  //  All N One LLC  //  Confidential", col, 289);
  doc.text(`Hash: GK-MLK-LL-V2`, W - margin, 289, { align: "right" });

  doc.save(`GravelKingProductions_Report_${Date.now()}.pdf`);
}
