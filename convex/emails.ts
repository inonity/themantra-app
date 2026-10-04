import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { orderPageUrl } from "./helpers/checkout";

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
        name: process.env.BREVO_SENDER_NAME ?? "The Mantra",
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
        subject: `You're invited to join The Mantra as ${roleLabel === "Agent" ? "an" : "a"} ${roleLabel}`,
        htmlContent: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Welcome to The Mantra!</h2>
            <p>Hi ${args.name},</p>
            <p>You've been invited to join <strong>The Mantra</strong> as <strong>${roleLabel}</strong>.</p>
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
      subject: "Confirm your new email address — The Mantra",
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

export const sendPasswordChangedEmail = internalAction({
  args: {
    email: v.string(),
    name: v.string(),
  },
  handler: async (_ctx, args) => {
    await sendBrevoEmail({
      to: [{ email: args.email, name: args.name }],
      subject: "Your password has been changed — The Mantra",
      htmlContent: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Password Changed</h2>
          <p>Hi ${args.name},</p>
          <p>Your password for <strong>The Mantra</strong> has been successfully changed.</p>
          <p>If you did not make this change, please contact your administrator immediately.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">
            The Mantra - Inventory & Sales Management
          </p>
        </div>
      `,
    });
  },
});

export const sendPasswordResetEmail = internalAction({
  args: {
    email: v.string(),
    name: v.string(),
    resetLink: v.string(),
  },
  handler: async (_ctx, args) => {
    await sendBrevoEmail({
      to: [{ email: args.email, name: args.name }],
      subject: "Reset your password — The Mantra",
      htmlContent: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Reset your password</h2>
          <p>Hi ${args.name},</p>
          <p>We received a request to reset your password for <strong>The Mantra</strong>.</p>
          <p>Click the button below to set a new password:</p>
          <p style="margin: 24px 0;">
            <a href="${args.resetLink}"
               style="background-color: #18181b; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500;">
              Reset Password
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">
            Or copy and paste this link into your browser:<br/>
            <a href="${args.resetLink}" style="color: #2563eb;">${args.resetLink}</a>
          </p>
          <p style="color: #dc2626; font-size: 14px; font-weight: 500;">
            This link expires in 1 hour.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">
            If you didn't request a password reset, you can safely ignore this email.
            Your password will not be changed.
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
      subject: "Welcome to The Mantra!",
      htmlContent: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome aboard!</h2>
          <p>Hi ${args.name},</p>
          <p>Your account has been set up successfully as <strong>${roleLabel}</strong> on <strong>The Mantra</strong>.</p>
          <p>You can now sign in and start using the app.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">
            The Mantra - Inventory & Sales Management
          </p>
        </div>
      `,
    });
  },
});

/* ---------------------------- Storefront orders --------------------------- */

// Everything below renders text a shopper typed, so it is always escaped.
function esc(value: string | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const rm = (amount: number) => `RM${amount.toFixed(2)}`;

function orderSummaryHtml(order: Doc<"orders">): string {
  const rows = order.lines
    .map(
      (l) => `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${esc(l.productName)} <span style="color: #6b7280;">${esc(l.variantName)}</span> × ${l.quantity}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${rm(l.unitPrice * l.quantity)}</td>
        </tr>`
    )
    .join("");
  const a = order.shippingAddress;
  return `
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      ${rows}
      <tr><td style="padding: 8px 0; color: #6b7280;">Shipping</td><td style="padding: 8px 0; text-align: right;">${order.shippingFee === 0 ? "Free" : rm(order.shippingFee)}</td></tr>
      <tr><td style="padding: 8px 0; font-weight: 600;">Total</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${rm(order.total)}</td></tr>
    </table>
    <p style="font-size: 14px; color: #374151; margin-top: 16px;">
      <strong>Shipping to</strong><br/>
      ${esc(order.customer.name)}<br/>
      ${esc(a.line1)}<br/>
      ${a.line2 ? `${esc(a.line2)}<br/>` : ""}
      ${esc(a.postcode)} ${esc(a.city)}, ${esc(a.state)}
    </p>`;
}

function orderButton(order: Doc<"orders">): string {
  const link = orderPageUrl(order);
  return `
    <p style="margin: 24px 0;">
      <a href="${link}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500;">
        View your order
      </a>
    </p>`;
}

export const sendOrderPaid = internalAction({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.runQuery(internal.orders.getInternal, args);
    if (!order) return;

    await sendBrevoEmail({
      to: [{ email: order.customer.email, name: order.customer.name }],
      subject: `Order ${order.orderNumber} confirmed — The Mantra`,
      htmlContent: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Thank you, ${esc(order.customer.name)}.</h2>
          <p>We've received your payment for order <strong>${order.orderNumber}</strong>. We'll email you again with tracking once it ships.</p>
          ${orderSummaryHtml(order)}
          ${orderButton(order)}
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">The Mantra</p>
        </div>
      `,
    });

    // HQ hears about every paid order. Optional: unset means no notification.
    const notify = process.env.ORDER_NOTIFY_EMAIL;
    if (notify) {
      await sendBrevoEmail({
        to: notify.split(",").map((email) => ({ email: email.trim() })),
        subject: `New paid order ${order.orderNumber} — ${rm(order.total)}`,
        htmlContent: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>New order ${order.orderNumber}</h2>
            <p>${esc(order.customer.name)} · ${esc(order.customer.email)} · +${esc(order.customer.phone)}</p>
            ${order.notes ? `<p><strong>Notes:</strong> ${esc(order.notes)}</p>` : ""}
            ${orderSummaryHtml(order)}
            <p><a href="${process.env.SITE_URL ?? ""}/dashboard/orders/${order._id}">Open in the dashboard</a></p>
          </div>
        `,
      });
    }
  },
});

export const sendOrderShipped = internalAction({
  args: { orderId: v.id("orders"), resend: v.boolean() },
  handler: async (ctx, args) => {
    const order = await ctx.runQuery(internal.orders.getInternal, { orderId: args.orderId });
    if (!order || !order.trackingNumber) return;

    await sendBrevoEmail({
      to: [{ email: order.customer.email, name: order.customer.name }],
      subject: `${args.resend ? "Updated tracking for" : "Your order has shipped:"} ${order.orderNumber} — The Mantra`,
      htmlContent: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>${args.resend ? "Updated tracking" : "It's on its way."}</h2>
          <p>Order <strong>${order.orderNumber}</strong> has shipped with <strong>${esc(order.courier)}</strong>.</p>
          <p style="font-size: 18px;">Tracking number: <strong>${esc(order.trackingNumber)}</strong></p>
          ${orderSummaryHtml(order)}
          ${orderButton(order)}
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">The Mantra</p>
        </div>
      `,
    });
  },
});
