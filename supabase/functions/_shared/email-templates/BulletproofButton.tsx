/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

interface BulletproofButtonProps {
  href: string
  label: string
  bgColor?: string
  textColor?: string
}

/**
 * Outlook-safe "bulletproof" CTA button.
 *
 * Uses VML for Outlook 2007–2019 (Windows) so the button renders as a clickable
 * filled rectangle even when CSS padding/background-color is stripped.
 * All other clients fall back to the standard <a> tag.
 *
 * IMPORTANT: Always pass HEX colors — Outlook does NOT support hsl()/rgba().
 */
export function BulletproofButton({
  href,
  label,
  bgColor = '#133332',
  textColor = '#ffffff',
}: BulletproofButtonProps) {
  // VML markup for Outlook is injected as raw HTML inside MSO conditional comments.
  // React Email strips unknown tags, so we use dangerouslySetInnerHTML on a wrapper div.
  const vmlHtml = `
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:44px;v-text-anchor:middle;width:220px;" arcsize="18%" stroke="f" fillcolor="${bgColor}">
  <w:anchorlock/>
  <center style="color:${textColor};font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">${label}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<a href="${href}" target="_blank" style="background-color:${bgColor};border-radius:8px;color:${textColor};display:inline-block;font-family:'Manrope',Arial,sans-serif;font-size:14px;font-weight:600;line-height:44px;text-align:center;text-decoration:none;width:220px;-webkit-text-size-adjust:none;mso-hide:all;">${label}</a>
<!--<![endif]-->
`
  return (
    <div
      style={{ margin: '8px 0 24px' }}
      dangerouslySetInnerHTML={{ __html: vmlHtml }}
    />
  )
}
