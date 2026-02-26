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

interface ReminderEmailProps {
  companyName: string;
  period: string;
  reportUrl: string;
}

export const ReminderEmail = ({ companyName, period, reportUrl }: ReminderEmailProps) => (
  <Html>
    <Head />
    <Preview>Påmindelse: Rapport for {period} mangler</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Rapport mangler for {period}</Heading>
        <Text style={text}>
          Hej! Vi mangler stadig den månedlige rapport for <strong>{period}</strong> fra <strong>{companyName}</strong>.
        </Text>
        <Text style={text}>
          Upload venligst jeres rapport, så vi kan følge med i virksomhedens udvikling.
        </Text>
        <Section style={buttonContainer}>
          <Link href={reportUrl} target="_blank" style={button}>
            Upload rapport
          </Link>
        </Section>
        <Text style={footer}>
          Denne påmindelse er sendt fra MOLA Founder. Hvis rapporten allerede er uploadet, kan du ignorere denne besked.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReminderEmail

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
