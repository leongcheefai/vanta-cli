import { describe, expect, it } from "vitest";
import {
  type IntegrationFlags,
  buildEnvContent,
} from "../src/lib/env-wizard.js";

const NO_INTEGRATIONS: IntegrationFlags = {
  resend: false,
  stripe: false,
  googleOAuth: false,
  s3: false,
  githubFeedback: false,
};

describe("buildEnvContent", () => {
  it("includes all required auto-fill vars", () => {
    const content = buildEnvContent(NO_INTEGRATIONS);
    expect(content).toContain(
      "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vanta_base_admin",
    );
    expect(content).toContain("NODE_ENV=development");
    expect(content).toContain("BETTER_AUTH_URL=http://localhost:3001");
    expect(content).toContain("APP_URL=http://localhost:3000");
    expect(content).toContain("WEB_URL=http://localhost:4321");
    expect(content).toContain("VITE_API_URL=http://localhost:3001");
  });

  it("generates BETTER_AUTH_SECRET as 44-char base64", () => {
    const content = buildEnvContent(NO_INTEGRATIONS);
    const match = content.match(/BETTER_AUTH_SECRET=(.+)/);
    expect(match).not.toBeNull();
    expect(match?.[1].trim().length).toBe(44);
  });

  it("generates a different BETTER_AUTH_SECRET each call", () => {
    const a = buildEnvContent(NO_INTEGRATIONS).match(
      /BETTER_AUTH_SECRET=(.+)/,
    )?.[1];
    const b = buildEnvContent(NO_INTEGRATIONS).match(
      /BETTER_AUTH_SECRET=(.+)/,
    )?.[1];
    expect(a).not.toBe(b);
  });

  it("excludes integration vars when all flags false", () => {
    const content = buildEnvContent(NO_INTEGRATIONS);
    expect(content).not.toContain("RESEND_API_KEY");
    expect(content).not.toContain("STRIPE_SECRET_KEY");
    expect(content).not.toContain("GOOGLE_CLIENT_ID");
    expect(content).not.toContain("S3_ACCESS_KEY_ID");
    expect(content).not.toContain("GITHUB_TOKEN");
  });

  it("includes Resend vars when resend flag is true", () => {
    const content = buildEnvContent({ ...NO_INTEGRATIONS, resend: true });
    expect(content).toContain("RESEND_API_KEY=");
  });

  it("includes Stripe vars when stripe flag is true", () => {
    const content = buildEnvContent({ ...NO_INTEGRATIONS, stripe: true });
    expect(content).toContain("STRIPE_SECRET_KEY=");
    expect(content).toContain("STRIPE_WEBHOOK_SECRET=");
    expect(content).toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=");
  });

  it("includes Google OAuth vars when googleOAuth flag is true", () => {
    const content = buildEnvContent({ ...NO_INTEGRATIONS, googleOAuth: true });
    expect(content).toContain("GOOGLE_CLIENT_ID=");
    expect(content).toContain("GOOGLE_CLIENT_SECRET=");
  });

  it("includes S3 vars when s3 flag is true", () => {
    const content = buildEnvContent({ ...NO_INTEGRATIONS, s3: true });
    expect(content).toContain("S3_ACCESS_KEY_ID=");
    expect(content).toContain("S3_SECRET_ACCESS_KEY=");
    expect(content).toContain("S3_BUCKET=");
    expect(content).toContain("S3_REGION=");
  });

  it("includes GitHub feedback vars when githubFeedback flag is true", () => {
    const content = buildEnvContent({
      ...NO_INTEGRATIONS,
      githubFeedback: true,
    });
    expect(content).toContain("GITHUB_TOKEN=");
    expect(content).toContain("GITHUB_FEEDBACK_REPO=");
  });

  it("ends with newline", () => {
    const content = buildEnvContent(NO_INTEGRATIONS);
    expect(content.endsWith("\n")).toBe(true);
  });
});
