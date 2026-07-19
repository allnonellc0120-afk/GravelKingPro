import { PDFDocument, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

const slides = [
  "slide_hook.jpg",
  "slide_market.jpg",
  "slide_product.jpg",
  "slide_technology.jpg",
  "slide_moat.jpg",
  "slide_revenue.jpg",
];

async function createPromoPitchDeck() {
  const pdf = await PDFDocument.create();
  const imgDir = path.resolve(import.meta.dirname, "../../artifacts/gravelkingpro-promo/public/images");
  const size = 1024;

  // cover page (black, title)
  const cover = pdf.addPage([size, size]);
  cover.drawRectangle({ x: 0, y: 0, width: size, height: size, color: rgb(0.03, 0.03, 0.03) });

  for (const file of slides) {
    const imgBytes = fs.readFileSync(path.join(imgDir, file));
    const img = await pdf.embedJpg(imgBytes);
    const page = pdf.addPage([size, size]);
    page.drawImage(img, { x: 0, y: 0, width: size, height: size });
  }

  // back page
  const back = pdf.addPage([size, size]);
  back.drawRectangle({ x: 0, y: 0, width: size, height: size, color: rgb(0.03, 0.03, 0.03) });

  const outPath = path.resolve(import.meta.dirname, "../../artifacts/gravelkingpro/public/GravelKingPro_PromoPitchDeck.pdf");
  fs.writeFileSync(outPath, await pdf.save());
  console.log(`Promo pitch deck PDF generated: ${outPath}`);
}

createPromoPitchDeck().catch((err) => {
  console.error(err);
  process.exit(1);
});
