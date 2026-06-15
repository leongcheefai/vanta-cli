import { randomBytes } from "node:crypto";

export interface IntegrationFlags {
  resend: boolean;
  stripe: boolean;
  googleOAuth: boolean;
  s3: boolean;
  githubFeedback: boolean;
}

export function buildEnvContent(flags: IntegrationFlags, port = 5432): string {
  const secret = randomBytes(33).toString("base64");
  const lines = [
    `DATABASE_URL=postgresql://postgres:postgres@localhost:${port}/vanta_base_admin`,
    "NODE_ENV=development",
    "BETTER_AUTH_URL=http://localhost:3001",
    `BETTER_AUTH_SECRET=${secret}`,
    "APP_URL=http://localhost:3000",
    "WEB_URL=http://localhost:4321",
    "VITE_API_URL=http://localhost:3001",
  ];

  if (flags.resend) {
    lines.push("", "# Resend", "RESEND_API_KEY=");
  }
  if (flags.stripe) {
    lines.push(
      "",
      "# Stripe",
      "STRIPE_SECRET_KEY=",
      "STRIPE_WEBHOOK_SECRET=",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=",
    );
  }
  if (flags.googleOAuth) {
    lines.push(
      "",
      "# Google OAuth",
      "GOOGLE_CLIENT_ID=",
      "GOOGLE_CLIENT_SECRET=",
    );
  }
  if (flags.s3) {
    lines.push(
      "",
      "# S3",
      "S3_ACCESS_KEY_ID=",
      "S3_SECRET_ACCESS_KEY=",
      "S3_BUCKET=",
      "S3_REGION=",
    );
  }
  if (flags.githubFeedback) {
    lines.push(
      "",
      "# GitHub Feedback",
      "GITHUB_TOKEN=",
      "GITHUB_FEEDBACK_REPO=",
    );
  }

  return `${lines.join("\n")}\n`;
}
