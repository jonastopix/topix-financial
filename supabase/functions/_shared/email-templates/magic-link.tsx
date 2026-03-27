/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

import { EmailBanner } from './EmailBanner.tsx'

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
          <Button style={button} href={confirmationUrl}>
            Log ind
          </Button>
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
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: 'hsl(170, 46%, 14%)', margin: '0 0 16px' }
const text = { fontSize: '14px', color: 'hsl(170, 15%, 35%)', lineHeight: '1.6', margin: '0 0 20px' }
const button = { backgroundColor: 'hsl(170, 46%, 14%)', color: '#ffffff', fontSize: '14px', fontWeight: '600' as const, borderRadius: '8px', padding: '13px 24px', textDecoration: 'none', display: 'inline-block', marginBottom: '24px' }
const footer = { fontSize: '12px', color: '#999999', margin: '24px 0 0', lineHeight: '1.5' }
