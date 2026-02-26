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
import * as React from 'npm:react@18.3.1'

interface InvitationEmailProps {
  companyName: string;
  signupUrl: string;
}

export const InvitationEmail = ({ companyName, signupUrl }: InvitationEmailProps) => (
  <Html>
    <Head />
    <Preview>Du er inviteret til {companyName} på The Boardroom</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Velkommen til The Boardroom</Heading>
        <Text style={text}>
          Du er blevet inviteret til at blive en del af <strong>{companyName}</strong> på The Boardroom — 
          en platform der hjælper virksomheder med at få overblik over økonomi, milepæle og strategi.
        </Text>
        <Section style={buttonContainer}>
          <Link href={signupUrl} target="_blank" style={button}>
            Acceptér invitation
          </Link>
        </Section>
        <Text style={text}>
          Når du accepterer invitationen med denne e-mail, bliver du automatisk tilknyttet {companyName}.
        </Text>
        <Text style={footer}>
          Denne invitation er sendt fra The Boardroom. Hvis du ikke forventer denne besked, kan du ignorere den.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InvitationEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
}

const container = {
  paddingLeft: '12px',
  paddingRight: '12px',
  margin: '0 auto',
  maxWidth: '480px',
}

const h1 = {
  color: '#1a1a2e',
  fontSize: '24px',
  fontWeight: 'bold' as const,
  margin: '40px 0 20px',
}

const text = {
  color: '#333',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '16px 0',
}

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
}

const button = {
  backgroundColor: '#6366f1',
  borderRadius: '8px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '14px',
  fontWeight: '600' as const,
  padding: '12px 32px',
  textDecoration: 'none',
}

const footer = {
  color: '#898989',
  fontSize: '12px',
  lineHeight: '20px',
  marginTop: '32px',
}
