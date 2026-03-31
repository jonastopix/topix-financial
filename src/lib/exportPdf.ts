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
    backgroundColor: getComputedStyle(document.documentElement)
      .getPropertyValue("--background").trim() || "#ffffff",
    onclone: (cloned) => {
      cloned.documentElement.classList.remove("dark");
      cloned.documentElement.style.colorScheme = "light";
    },
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

  // Place full image; jsPDF clips to page boundaries automatically
  pdf.addImage(imgData, "PNG", margin, startY, contentWidth, imgHeight);

  pdf.save(filename);
}
