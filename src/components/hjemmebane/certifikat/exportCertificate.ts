/**
 * Eksport i browseren: det fuldstørrelses-certifikat (1123 x 794) rendres i en skjult
 * "stage" og fotograferes med html-to-image i 3x opløsning (3369 x 2382 px, ca. 290 dpi
 * på A4). PDF laves med jsPDF som én A4-liggende side.
 *
 * npm i html-to-image jspdf
 *
 * Krav:
 *  - Portræt- og rådgiverfotos skal kunne hentes med CORS (Supabase Storage: offentlig
 *    bucket eller signeret URL). Ellers bliver de blanke i eksporten.
 *  - Eksportér fra den skjulte fuldstørrelses-node, ALDRIG fra den nedskalerede preview.
 */
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

async function waitForAssets(node: HTMLElement) {
  await document.fonts.ready;
  // Sørg for at alle tre familier faktisk er indlæst, før der tages billede.
  await Promise.all([
    document.fonts.load('400 40px "Gilda Display"'),
    document.fonts.load('600 16px "Manrope"'),
    document.fonts.load('700 32px "Parkinsans"'),
  ]);
  const imgs = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((res) => {
            img.onload = () => res();
            img.onerror = () => res();
          }),
    ),
  );
}

export async function renderCertificatePng(node: HTMLElement, pixelRatio = 3): Promise<string> {
  await waitForAssets(node);
  const opts = { pixelRatio, width: 1123, height: 794, cacheBust: true };
  // Første kald varmer html-to-image op (kendt Safari-fejl med manglende billeder/fonte).
  await toPng(node, opts);
  return toPng(node, opts);
}

function triggerDownload(dataUrl: string, fileName: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function downloadCertificatePng(node: HTMLElement, baseName: string) {
  const png = await renderCertificatePng(node, 2);
  triggerDownload(png, `${baseName}.png`);
}

export async function downloadCertificatePdf(node: HTMLElement, baseName: string) {
  const png = await renderCertificatePng(node, 3);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  pdf.addImage(png, "PNG", 0, 0, 297, 210, undefined, "FAST");
  pdf.setProperties({ title: "The Boardroom certifikat", creator: "The Boardroom" });
  pdf.save(`${baseName}.pdf`);
}
