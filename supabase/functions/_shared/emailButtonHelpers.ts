/**
 * Shared helpers for Outlook-safe HTML email components.
 *
 * Outlook (2007–2019 on Windows) ignores CSS `padding`, `background-color`
 * on <a> tags, and `hsl()` colors. We compensate with VML conditional
 * comments and hex colors.
 *
 * USE THESE HELPERS in any edge function or DB template that builds raw HTML.
 */

interface BulletproofButtonOptions {
  href: string;
  label: string;
  bgColor?: string; // HEX only — no hsl()/rgba()
  textColor?: string;
  width?: number; // px
  height?: number; // px
}

/**
 * Renders an Outlook-safe CTA button using VML for Outlook + standard <a>
 * for everyone else. Wrapped in a centered div with vertical spacing.
 */
export function bulletproofButton({
  href,
  label,
  bgColor = "#133332",
  textColor = "#ffffff",
  width = 220,
  height = 44,
}: BulletproofButtonOptions): string {
  const safeHref = href.replace(/"/g, "&quot;");
  const safeLabel = label.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="text-align:center;margin:24px 0">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:${height}px;v-text-anchor:middle;width:${width}px;" arcsize="18%" stroke="f" fillcolor="${bgColor}">
  <w:anchorlock/>
  <center style="color:${textColor};font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">${safeLabel}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<a href="${safeHref}" target="_blank" style="background-color:${bgColor};border-radius:8px;color:${textColor};display:inline-block;font-family:'Manrope','Space Grotesk',Arial,sans-serif;font-size:14px;font-weight:600;line-height:${height}px;text-align:center;text-decoration:none;width:${width}px;-webkit-text-size-adjust:none;mso-hide:all;">${safeLabel}</a>
<!--<![endif]-->
</div>`;
}

/**
 * Visible "click here / copy link" fallback that always renders, even if
 * the bulletproof button is somehow stripped. Place directly under the CTA.
 */
export function fallbackLinkBlock(href: string): string {
  const safeHref = href.replace(/"/g, "&quot;");
  return `<p style="color:#4D6663;font-size:13px;line-height:1.6;margin:8px 0 6px">Virker knappen ikke? Kopiér dette link ind i din browser:</p>
<p style="margin:0 0 20px;word-break:break-all"><a href="${safeHref}" target="_blank" style="color:#20916C;font-size:12px;text-decoration:underline">${safeHref}</a></p>`;
}

/** Standard Boardroom header banner with Outlook-safe hex colors. */
export function brandHeader(): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse" role="presentation">
    <tr><td style="background-color:#133332;padding:18px 24px;border-radius:10px 10px 0 0">
      <span style="font-family:'Manrope',Arial,sans-serif;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px">The Boardroom</span>
      <span style="font-family:'Manrope',Arial,sans-serif;font-size:13px;font-weight:400;color:#8FA3A1">&nbsp;by Topix</span>
    </td></tr>
    <tr><td style="height:3px;background-color:#27AE82"></td></tr>
  </table>`;
}
