/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

import { EmailBanner } from './EmailBanner.tsx'
import { BulletproofButton } from './BulletproofButton.tsx'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="da" dir="ltr">
    <Head />
    <Preview>Dit login-link til {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <EmailBanner />
        <Section style={content}>
          <Heading style={h1}>Dit login-link</Heading>
          <Text style={text}>
            Klik på knappen herunder for at logge ind på {siteName}.
            Linket udløber kort efter.
          </Text>
          <BulletproofButton href={confirmationUrl} label="Log ind" />
          <Text style={fallbackIntro}>
            Virker knappen ikke? Kopiér dette link ind i din browser:
          </Text>
          <Text style={fallbackUrl}>
            <Link href={confirmationUrl} style={link}>{confirmationUrl}</Link>
          </Text>
          <Text style={footer}>
            Hvis du ikke har anmodet om dette link, kan du blot ignorere denne email.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#f4f4f5', fontFamily: "'Manrope', Arial, sans-serif" }
const container = { maxWidth: '520px', margin: '32px auto', backgroundColor: '#ffffff', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
const content = { padding: '28px 32px 32px' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: '#133332', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#4D6663', lineHeight: '1.6', margin: '0 0 20px' }
const link = { color: '#20916C', textDecoration: 'underline' }
const fallbackIntro = { fontSize: '13px', color: '#4D6663', lineHeight: '1.6', margin: '8px 0 6px' }
const fallbackUrl = { fontSize: '12px', color: '#20916C', lineHeight: '1.5', margin: '0 0 20px', wordBreak: 'break-all' as const }
const footer = { fontSize: '12px', color: '#999999', margin: '24px 0 0', lineHeight: '1.5' }
