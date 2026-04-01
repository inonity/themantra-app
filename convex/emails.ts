import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

async function sendBrevoEmail({
  to,
  subject,
  htmlContent,
}: {
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
}) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error("BREVO_API_KEY environment variable is not set");
  }

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: process.env.BREVO_SENDER_NAME ?? "TheMantra",
        email: process.env.BREVO_SENDER_EMAIL ?? "noreply@themantra.com",
      },
      to,
      subject,
      htmlContent,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Brevo API error (${response.status}): ${errorBody}`);
  }

  return await response.json();
}

export const sendInviteEmail = internalAction({
  args: {
    email: v.string(),
    name: v.string(),
    role: v.string(),
    inviteLink: v.string(),
    inviteId: v.optional(v.id("agentInvites")),
  },
  handler: async (ctx, args) => {
    const roleLabel = args.role === "sales" ? "Sales Staff" : "Agent";

    try {
      await sendBrevoEmail({
        to: [{ email: args.email, name: args.name }],
        subject: `You're invited to join TheMantra as ${roleLabel === "Agent" ? "an" : "a"} ${roleLabel}`,
        htmlContent: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Welcome to TheMantra!</h2>
            <p>Hi ${args.name},</p>
            <p>You've been invited to join <strong>TheMantra</strong> as <strong>${roleLabel}</strong>.</p>
            <p>Click the button below to set up your password and get started:</p>
            <p style="margin: 24px 0;">
              <a href="${args.inviteLink}"
                 style="background-color: #18181b; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500;">
                Set Up Your Account
              </a>
            </p>
            <p style="color: #6b7280; font-size: 14px;">
              Or copy and paste this link into your browser:<br/>
              <a href="${args.inviteLink}" style="color: #2563eb;">${args.inviteLink}</a>
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="color: #9ca3af; font-size: 12px;">
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>
        `,
      });

      // Mark email as sent
      if (args.inviteId) {
        await ctx.runMutation(internal.agentInvites.markEmailSent, {
          inviteId: args.inviteId,
        });
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Unknown error";
      // Mark email as failed
      if (args.inviteId) {
        await ctx.runMutation(internal.agentInvites.markEmailFailed, {
          inviteId: args.inviteId,
          error: errorMsg,
        });
      }
      throw e;
    }
  },
});

export const sendEmailConfirmation = internalAction({
  args: {
    email: v.string(),
    name: v.string(),
    confirmLink: v.string(),
    expiresInMinutes: v.number(),
  },
  handler: async (_ctx, args) => {
    await sendBrevoEmail({
      to: [{ email: args.email, name: args.name }],
      subject: "Confirm your new email address — TheMantra",
      htmlContent: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Confirm your email change</h2>
          <p>Hi ${args.name},</p>
          <p>You requested to change your email address to <strong>${args.email}</strong>.</p>
          <p>Click the button below to confirm this change:</p>
          <p style="margin: 24px 0;">
            <a href="${args.confirmLink}"
               style="background-color: #18181b; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500;">
              Confirm Email Change
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">
            Or copy and paste this link into your browser:<br/>
            <a href="${args.confirmLink}" style="color: #2563eb;">${args.confirmLink}</a>
          </p>
          <p style="color: #dc2626; font-size: 14px; font-weight: 500;">
            This link expires in ${args.expiresInMinutes} minutes.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">
            If you didn't request this change, you can safely ignore this email.
            Your email address will not be changed.
          </p>
        </div>
      `,
    });
  },
});

export const sendWelcomeEmail = internalAction({
  args: {
    email: v.string(),
    name: v.string(),
    role: v.string(),
  },
  handler: async (_ctx, args) => {
    const roleLabel = args.role === "sales" ? "Sales Staff" : "Agent";

    await sendBrevoEmail({
      to: [{ email: args.email, name: args.name }],
      subject: "Welcome to TheMantra!",
      htmlContent: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome aboard!</h2>
          <p>Hi ${args.name},</p>
          <p>Your account has been set up successfully as <strong>${roleLabel}</strong> on <strong>TheMantra</strong>.</p>
          <p>You can now sign in and start using the app.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">
            TheMantra - Inventory & Sales Management
          </p>
        </div>
      `,
    });
  },
});
