import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export async function exportKPIReport(
  elementId: string,
  filename: string
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) throw new Error("Element not found");

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * contentWidth) / canvas.width;

  // Add header
  pdf.setFontSize(14);
  pdf.setTextColor(30, 30, 30);
  pdf.text("The Boardroom — KPI Rapport", margin, margin);
  pdf.setFontSize(9);
  pdf.setTextColor(120, 120, 120);
  pdf.text(
    new Date().toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" }),
    margin, margin + 6
  );

  const startY = margin + 12;

  if (imgHeight <= pageHeight - startY - margin) {
    pdf.addImage(imgData, "PNG", margin, startY, contentWidth, imgHeight);
  } else {
    // Multi-page: slice the canvas
    const pageContentHeight = pageHeight - startY - margin;
    const totalPages = Math.ceil(imgHeight / pageContentHeight);
    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage();
      const yOffset = page * pageContentHeight;
      pdf.addImage(
        imgData, "PNG", margin, page === 0 ? startY : margin,
        contentWidth, imgHeight, undefined, "FAST", 0, -yOffset
      );
    }
  }

  pdf.save(filename);
}
