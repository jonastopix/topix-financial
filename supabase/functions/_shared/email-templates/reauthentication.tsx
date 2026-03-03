/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="da" dir="ltr">
    <Head />
    <Preview>Din bekræftelseskode</Preview>
    <Body style={main}>
      <Container style={container}>
        <div style={logoBadge}>BR</div>
        <Heading style={h1}>Bekræft din identitet</Heading>
        <Text style={text}>Brug koden herunder for at bekræfte din identitet:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          Koden udløber om kort tid. Hvis du ikke har anmodet om dette, kan du ignorere denne email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '480px', margin: '0 auto' }
const logoBadge: React.CSSProperties = {
  width: '48px',
  height: '48px',
  borderRadius: '12px',
  backgroundColor: '#0fa968',
  color: '#ffffff',
  fontSize: '18px',
  fontWeight: 700,
  fontFamily: "'Space Grotesk', Arial, sans-serif",
  lineHeight: '48px',
  textAlign: 'center',
  marginBottom: '24px',
}
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#141a21',
  margin: '0 0 20px',
  fontFamily: "'Space Grotesk', Arial, sans-serif",
}
const text = {
  fontSize: '14px',
  color: '#656d78',
  lineHeight: '1.6',
  margin: '0 0 20px',
}
const codeStyle = {
  fontFamily: "'Space Grotesk', Courier, monospace",
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: '#0fa968',
  margin: '0 0 30px',
  letterSpacing: '4px',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
