/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
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

interface EmailChangeEmailProps {
  siteName: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="da" dir="ltr">
    <Head />
    <Preview>Bekræft din nye email for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <EmailBanner />
        <Section style={content}>
          <Heading style={h1}>Bekræft din nye email</Heading>
          <Text style={text}>
            Du har anmodet om at ændre din email for {siteName} fra{' '}
            <Link href={`mailto:${email}`} style={link}>
              {email}
            </Link>{' '}
            til{' '}
            <Link href={`mailto:${newEmail}`} style={link}>
              {newEmail}
            </Link>
            .
          </Text>
          <Text style={text}>
            Klik på knappen herunder for at bekræfte ændringen:
          </Text>
          <Button style={button} href={confirmationUrl}>
            Bekræft email-ændring
          </Button>
          <Text style={footer}>
            Hvis du ikke har anmodet om denne ændring, bør du sikre din konto
            øjeblikkeligt.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

const main = { backgroundColor: '#f4f4f5', fontFamily: "'Manrope', Arial, sans-serif" }
const container = { maxWidth: '520px', margin: '32px auto', backgroundColor: '#ffffff', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
const content = { padding: '28px 32px 32px' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: 'hsl(170, 46%, 14%)', margin: '0 0 16px' }
const text = { fontSize: '14px', color: 'hsl(170, 15%, 35%)', lineHeight: '1.6', margin: '0 0 20px' }
const link = { color: 'hsl(158, 64%, 35%)', textDecoration: 'underline' }
const button = { backgroundColor: 'hsl(170, 46%, 14%)', color: '#ffffff', fontSize: '14px', fontWeight: '600' as const, borderRadius: '8px', padding: '13px 24px', textDecoration: 'none', display: 'inline-block', marginBottom: '24px' }
const footer = { fontSize: '12px', color: '#999999', margin: '24px 0 0', lineHeight: '1.5' }
