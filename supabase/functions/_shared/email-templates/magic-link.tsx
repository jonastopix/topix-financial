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
  Text,
} from 'npm:@react-email/components@0.0.22'

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
    <Preview>Dit login-link til The Boardroom</Preview>
    <Body style={main}>
      <Container style={container}>
        <div style={logoBadge}>BR</div>
        <Heading style={h1}>Dit login-link</Heading>
        <Text style={text}>
          Klik på knappen herunder for at logge ind på The Boardroom. Linket udløber om kort tid.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Log ind
        </Button>
        <Text style={footer}>
          Hvis du ikke har anmodet om dette link, kan du ignorere denne email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

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
const button = {
  backgroundColor: '#0fa968',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 600 as const,
  borderRadius: '12px',
  padding: '12px 24px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
