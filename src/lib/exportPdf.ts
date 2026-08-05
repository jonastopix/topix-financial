import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export async function exportKPIReport(
  elementId: string,
  filename: string,
  // Valgfri baggrund (Hb-fladen sender sin papir-tone som færdig rgb-værdi).
  // Default-stien (uden options) har fortsat præcis ÉN kalder: KPIs.tsx:127.
  // :root røres aldrig.
  options?: { backgroundColor?: string }
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) throw new Error("Element not found");

  const backgroundColor =
    options?.backgroundColor ??
    (getComputedStyle(document.documentElement)
      .getPropertyValue("--background").trim() || "#ffffff");

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor,
    onclone: (cloned) => {
      cloned.documentElement.classList.remove("dark");
      cloned.documentElement.style.colorScheme = "light";
    },
    logging: false,
  });

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const mmPerCanvasPx = contentWidth / canvas.width;

  // Add header (kun side 1)
  pdf.setFontSize(14);
  pdf.setTextColor(30, 30, 30);
  pdf.text("The Boardroom — KPI Rapport", margin, margin);
  pdf.setFontSize(9);
  pdf.setTextColor(120, 120, 120);
  pdf.text(
    new Date().toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" }),
    margin, margin + 6
  );

  let startY = margin + 12;

  // Sektions-bevidst side-opdeling: ét samlet canvas, men sideskift lægges
  // KUN på grænserne mellem eksport-rodens direkte børn (sektionerne), så
  // et snit altid lander i sektions-mellemrummet — aldrig midt i en
  // tekstlinje, og en eyebrow skilles aldrig fra sit indhold. Tidligere
  // blev alt under side 1 klippet væk af jsPDF ("clips to page boundaries").
  const elementRect = element.getBoundingClientRect();
  const canvasPxPerCssPx = canvas.height / elementRect.height;
  const sections = Array.from(element.children)
    .map((child) => {
      const r = child.getBoundingClientRect();
      return {
        top: Math.max(0, Math.floor((r.top - elementRect.top) * canvasPxPerCssPx)),
        bottom: Math.min(canvas.height, Math.ceil((r.bottom - elementRect.top) * canvasPxPerCssPx)),
      };
    })
    .filter((s) => s.bottom > s.top);

  const drawSlice = (sliceTop: number, sliceBottom: number, y: number) => {
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceBottom - sliceTop;
    const ctx = sliceCanvas.getContext("2d")!;
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    ctx.drawImage(canvas, 0, sliceTop, canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
    pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", margin, y, contentWidth, sliceCanvas.height * mmPerCanvasPx);
  };

  if (sections.length === 0) {
    // Fallback (ingen sektionsbørn): hidtidig enkelt-placering.
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", margin, startY, contentWidth, canvas.height * mmPerCanvasPx);
    pdf.save(filename);
    return;
  }

  const availMm = () => pageHeight - margin - startY;
  const newPage = () => {
    pdf.addPage();
    startY = margin;
  };

  // Grådig pakning: sidens slice spænder [spanTop; sidste medtagne sektions
  // bund]. En ny sektion medtages hvis hele spandet stadig kan stå på siden.
  let spanTop: number | null = null;
  let spanBottom = 0;
  const flush = () => {
    if (spanTop != null && spanBottom > spanTop) drawSlice(spanTop, spanBottom, startY);
    spanTop = null;
  };

  for (const s of sections) {
    const candidateTop = spanTop ?? s.top;
    if ((s.bottom - candidateTop) * mmPerCanvasPx <= availMm()) {
      spanTop = candidateTop;
      spanBottom = s.bottom;
      continue;
    }
    if (spanTop != null) {
      flush();
      newPage();
    } else if ((s.bottom - s.top) * mmPerCanvasPx <= pageHeight - margin * 2) {
      // Første sektion passer ikke på side 1 (header-pladsen) men på en frisk.
      newPage();
    }
    spanTop = s.top;
    spanBottom = s.bottom;
    // Værn: en sektion højere end en hel side hard-slices inde i sektionen.
    // Findes ikke blandt fladens nuværende sektioner (grafkort er h-64/h-72).
    while ((spanBottom - spanTop) * mmPerCanvasPx > availMm()) {
      const cutPx = spanTop + Math.floor(availMm() / mmPerCanvasPx);
      drawSlice(spanTop, cutPx, startY);
      newPage();
      spanTop = cutPx;
    }
  }
  flush();

  pdf.save(filename);
}
