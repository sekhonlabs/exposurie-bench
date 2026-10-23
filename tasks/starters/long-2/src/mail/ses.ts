import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { config } from '../config';

const ses = new SESv2Client({ region: config.awsRegion });

export async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: config.mailFrom,
      Destination: { ToAddresses: [to] },
      Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: text } } } },
    }),
  );
}
