/**
 * Payment gateways, behind one interface so the storefront doesn't care which
 * is live. To add one (Billplz, HerePay, Stripe…):
 *
 *   1. Implement `PaymentProvider` below.
 *   2. Add its id to `payments.provider` in schema.ts and to `PROVIDERS`.
 *   3. Route its callback in http.ts to `internal.payments.reconcile`.
 *
 * A provider's callback is only ever a hint. Whatever it claims, `lookup`
 * asks the provider directly before an order is marked paid.
 */

export type ProviderId = "toyyibpay";

export type CreateInput = {
  orderNumber: string;
  amount: number; // RM
  customer: { name: string; email: string; phone: string };
  description: string;
  returnUrl: string;
  callbackUrl: string;
};

export type LookupResult =
  | { status: "paid"; amountReceived: number; transactionId?: string; channel?: string }
  | { status: "pending" }
  | { status: "failed"; reason?: string };

export interface PaymentProvider {
  id: ProviderId;
  /** Whether the deployment has the keys this provider needs. */
  configured(): boolean;
  create(input: CreateInput): Promise<{ reference: string; redirectUrl: string }>;
  lookup(reference: string): Promise<LookupResult>;
}

/* -------------------------------- ToyyibPay ------------------------------- */
// https://toyyibpay.com/apireference/

function toyyibBase(): string {
  // https://dev.toyyibpay.com for the sandbox.
  return (process.env.TOYYIBPAY_BASE_URL ?? "https://toyyibpay.com").replace(/\/$/, "");
}

/** ToyyibPay allows only letters, digits, spaces and "_" in names. */
function toyyibText(value: string, max: number): string {
  return value.replace(/[^A-Za-z0-9 _]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

async function toyyibPost(path: string, fields: Record<string, string>): Promise<unknown> {
  const response = await fetch(`${toyyibBase()}/index.php/api/${path}`, {
    method: "POST",
    body: new URLSearchParams(fields),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`ToyyibPay ${path} failed (${response.status}): ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    // Errors come back as bare strings, e.g. "KEY-DID-NOT-EXIST".
    throw new Error(`ToyyibPay ${path} returned: ${text.slice(0, 200)}`);
  }
}

const toyyibpay: PaymentProvider = {
  id: "toyyibpay",

  configured() {
    return Boolean(process.env.TOYYIBPAY_SECRET_KEY && process.env.TOYYIBPAY_CATEGORY_CODE);
  },

  async create(input) {
    const secret = process.env.TOYYIBPAY_SECRET_KEY;
    const category = process.env.TOYYIBPAY_CATEGORY_CODE;
    if (!secret || !category) throw new Error("ToyyibPay is not configured");

    const result = await toyyibPost("createBill", {
      userSecretKey: secret,
      categoryCode: category,
      billName: toyyibText(`The Mantra ${input.orderNumber}`, 30),
      billDescription: toyyibText(input.description, 100) || "Order",
      billPriceSetting: "1",
      billPayorInfo: "1",
      billAmount: String(Math.round(input.amount * 100)),
      billReturnUrl: input.returnUrl,
      billCallbackUrl: input.callbackUrl,
      billExternalReferenceNo: input.orderNumber,
      billTo: input.customer.name,
      billEmail: input.customer.email,
      billPhone: input.customer.phone,
      billSplitPayment: "0",
      billSplitPaymentArgs: "",
      // 0 = FPX, 1 = card, 2 = both. Cards need activating on the account.
      billPaymentChannel: process.env.TOYYIBPAY_PAYMENT_CHANNEL ?? "0",
      // Blank: The Mantra absorbs the fees rather than the shopper.
      billChargeToCustomer: "",
      billExpiryDays: "1",
    });

    const billCode =
      Array.isArray(result) && typeof result[0]?.BillCode === "string" ? result[0].BillCode : null;
    if (!billCode) {
      throw new Error(`ToyyibPay createBill returned no BillCode: ${JSON.stringify(result).slice(0, 200)}`);
    }
    return { reference: billCode, redirectUrl: `${toyyibBase()}/${billCode}` };
  },

  async lookup(reference) {
    const result = await toyyibPost("getBillTransactions", { billCode: reference });
    const transactions = Array.isArray(result) ? result : [];

    // billpaymentStatus: 1 = paid, 2/4 = pending, 3 = failed.
    const paid = transactions.find((t) => String(t?.billpaymentStatus) === "1");
    if (paid) {
      const amount = Number.parseFloat(String(paid.billpaymentAmount).replace(/,/g, ""));
      return {
        status: "paid",
        amountReceived: Number.isFinite(amount) ? amount : 0,
        transactionId: paid.billpaymentInvoiceNo ? String(paid.billpaymentInvoiceNo) : undefined,
        channel: paid.billpaymentChannel ? String(paid.billpaymentChannel) : undefined,
      };
    }
    const settled = transactions.filter((t) => String(t?.billpaymentStatus) === "3");
    if (transactions.length > 0 && settled.length === transactions.length) {
      return { status: "failed", reason: "The bank declined or the payment was cancelled." };
    }
    return { status: "pending" };
  },
};

export const PROVIDERS: Record<ProviderId, PaymentProvider> = { toyyibpay };

export function isProviderId(value: string): value is ProviderId {
  return value in PROVIDERS;
}
