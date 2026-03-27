/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Section } from 'npm:@react-email/components@0.0.22'

export function EmailBanner() {
  return (
    <Section style={bannerSection}>
      <table width="100%" cellPadding={0} cellSpacing={0}>
        <tr>
          <td style={bannerTd}>
            <span style={logoText}>The Boardroom</span>
            <span style={logoBy}> by Topix</span>
          </td>
        </tr>
      </table>
      <div style={divider} />
    </Section>
  )
}

const bannerSection = { marginBottom: '0px' }
const bannerTd = { backgroundColor: 'hsl(170, 46%, 14%)', padding: '18px 24px', borderRadius: '10px 10px 0 0' }
const logoText = { fontFamily: "'Manrope', Arial, sans-serif", fontSize: '18px', fontWeight: '700' as const, color: '#ffffff', letterSpacing: '-0.3px' }
const logoBy = { fontFamily: "'Manrope', Arial, sans-serif", fontSize: '13px', fontWeight: '400' as const, color: 'rgba(255,255,255,0.55)' }
const divider = { height: '3px', backgroundColor: 'hsl(158, 64%, 42%)', marginBottom: '0px' }
