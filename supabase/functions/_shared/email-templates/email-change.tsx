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
  Text,
} from 'npm:@react-email/components@0.0.22'

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
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Manrope', Arial, sans-serif" }
const container = { padding: '20px 25px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: 'hsl(170, 46%, 14%)',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: 'hsl(170, 15%, 40%)',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const link = { color: 'inherit', textDecoration: 'underline' }
const button = {
  backgroundColor: 'hsl(170, 46%, 14%)',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '10px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
