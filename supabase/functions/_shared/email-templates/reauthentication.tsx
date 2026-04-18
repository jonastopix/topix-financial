/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

import { EmailBanner } from './EmailBanner.tsx'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="da" dir="ltr">
    <Head />
    <Preview>Din bekræftelseskode</Preview>
    <Body style={main}>
      <Container style={container}>
        <EmailBanner />
        <Section style={content}>
          <Heading style={h1}>Bekræft din identitet</Heading>
          <Text style={text}>Brug koden herunder for at bekræfte din identitet:</Text>
          <Text style={codeStyle}>{token}</Text>
          <Text style={footer}>
            Koden udløber kort efter. Hvis du ikke har anmodet om dette, kan du
            blot ignorere denne email.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#f4f4f5', fontFamily: "'Manrope', Arial, sans-serif" }
const container = { maxWidth: '520px', margin: '32px auto', backgroundColor: '#ffffff', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
const content = { padding: '28px 32px 32px' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: '#133332', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#4D6663', lineHeight: '1.6', margin: '0 0 20px' }
const codeStyle = { fontFamily: 'Courier, monospace', fontSize: '28px', fontWeight: 'bold' as const, color: '#133332', letterSpacing: '6px', margin: '0 0 30px', padding: '16px 24px', backgroundColor: '#f4f4f5', borderRadius: '8px', textAlign: 'center' as const }
const footer = { fontSize: '12px', color: '#999999', margin: '24px 0 0', lineHeight: '1.5' }
