// Banks and e-wallets in Malaysia that can receive a DuitNow / IBG transfer.
// Grouped so the picker stays readable; the stored value is the display name.

export type BankGroup = {
  label: string;
  banks: string[];
};

export const MALAYSIAN_BANK_GROUPS: BankGroup[] = [
  {
    label: "Commercial banks",
    banks: [
      "Affin Bank",
      "Alliance Bank",
      "AmBank",
      "CIMB Bank",
      "Hong Leong Bank",
      "Maybank",
      "Public Bank",
      "RHB Bank",
    ],
  },
  {
    label: "Islamic & development banks",
    banks: [
      "Agrobank",
      "Al Rajhi Bank",
      "Bank Islam",
      "Bank Muamalat",
      "Bank Rakyat",
      "Bank Simpanan Nasional (BSN)",
      "Kuwait Finance House",
      "MBSB Bank",
    ],
  },
  {
    label: "Foreign banks",
    banks: [
      "Bank of China (Malaysia)",
      "HSBC Bank Malaysia",
      "OCBC Bank (Malaysia)",
      "Standard Chartered Bank Malaysia",
      "UOB Malaysia",
    ],
  },
  {
    label: "Digital banks",
    banks: [
      "AEON Bank",
      "Boost Bank",
      "GXBank",
      "KAF Digital Bank",
      "Ryt Bank",
    ],
  },
  {
    label: "E-wallets",
    banks: ["Touch 'n Go eWallet"],
  },
];

export const MALAYSIAN_BANKS: string[] = MALAYSIAN_BANK_GROUPS.flatMap(
  (g) => g.banks
);

export const OTHER_BANK_VALUE = "__other__";

export function isKnownBank(name: string | undefined): boolean {
  return !!name && MALAYSIAN_BANKS.includes(name);
}
