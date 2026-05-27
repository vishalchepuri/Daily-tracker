export type BankColor = {
  name: string;
  colorName: string;
  colorCode: string;
};

export const bankColors: BankColor[] = [
  { name: "State Bank of India (SBI)", colorName: "Red", colorCode: "FF0000" },
  { name: "Punjab National Bank (PNB)", colorName: "Blue", colorCode: "0000FF" },
  { name: "Bank of Baroda", colorName: "Green", colorCode: "00AA00" },
  { name: "Canara Bank", colorName: "Orange", colorCode: "FFA500" },
  { name: "Union Bank of India", colorName: "Purple", colorCode: "800080" },
  { name: "Indian Bank", colorName: "Pink", colorCode: "FF69B4" },
  { name: "Indian Overseas Bank", colorName: "Brown", colorCode: "8B4513" },
  { name: "UCO Bank", colorName: "Gray", colorCode: "808080" },
  { name: "Bank of Maharashtra", colorName: "Navy", colorCode: "000080" },
  { name: "Punjab and Sind Bank", colorName: "Teal", colorCode: "008080" },
  { name: "Bank of India", colorName: "Maroon", colorCode: "800000" },
  { name: "Central Bank of India", colorName: "Olive", colorCode: "808000" },
  { name: "HDFC Bank", colorName: "Lime", colorCode: "00FF00" },
  { name: "ICICI Bank", colorName: "Aqua", colorCode: "00FFFF" },
  { name: "Axis Bank", colorName: "Silver", colorCode: "C0C0C0" },
  { name: "Kotak Mahindra Bank", colorName: "Indigo", colorCode: "4B0082" },
  { name: "Indusind Bank", colorName: "Violet", colorCode: "EE82EE" },
  { name: "IDBI Bank", colorName: "Gold", colorCode: "FFD700" },
  { name: "Federal Bank", colorName: "Crimson", colorCode: "DC143C" },
  { name: "Dhanlaxmi Bank", colorName: "Scarlet", colorCode: "FF2400" },
  { name: "Jammu & Kashmir Bank", colorName: "Coral", colorCode: "FF7F50" },
  { name: "South Indian Bank", colorName: "Salmon", colorCode: "FA8072" },
  { name: "RBL Bank", colorName: "Khaki", colorCode: "F0E68C" },
  { name: "Bandhan Bank", colorName: "Turquoise", colorCode: "40E0D0" },
  { name: "Citbank India", colorName: "Cyan", colorCode: "00FFFF" },
  { name: "Deutsche Bank India", colorName: "Magenta", colorCode: "FF00FF" },
  { name: "Standard Chartered Bank", colorName: "Yellow", colorCode: "FFFF00" },
  { name: "HSBC Bank India", colorName: "Peach", colorCode: "FFDAB9" },
  { name: "BNP Paribas Bank", colorName: "Mint", colorCode: "98FF98" },
  { name: "DBS Bank India", colorName: "Lavender", colorCode: "E6E6FA" },
  { name: "YES Bank", colorName: "Tan", colorCode: "D2B48C" },
  { name: "Nainital Bank", colorName: "Beige", colorCode: "F5F5DC" },
  { name: "AU Small Finance Bank", colorName: "Ivory", colorCode: "FFFFF0" },
  { name: "Equitas Small Finance Bank", colorName: "Wheat", colorCode: "F5DEB3" },
  { name: "Jana Small Finance Bank", colorName: "Bisque", colorCode: "FFE4C4" },
  { name: "ESAF Small Finance Bank", colorName: "Chocolate", colorCode: "D2691E" },
  { name: "Ujjivan Small Finance Bank", colorName: "Peru", colorCode: "CD853F" },
  { name: "Fincare Small Finance Bank", colorName: "RosyBrown", colorCode: "BC8F8F" },
  { name: "PSPL Small Finance Bank", colorName: "DarkRed", colorCode: "8B0000" },
  { name: "Suryoday Small Finance Bank", colorName: "DarkGreen", colorCode: "006400" },
  { name: "Shivalik Small Finance Bank", colorName: "DarkBlue", colorCode: "00008B" },
  { name: "Northeast Small Finance Bank", colorName: "DarkCyan", colorCode: "008B8B" },
  { name: "Aryaman Finance Limited", colorName: "DarkMagenta", colorCode: "8B008B" },
  { name: "Unity Small Finance Bank", colorName: "DarkOrange", colorCode: "FF8C00" },
  { name: "Airtel Payments Bank", colorName: "LightCoral", colorCode: "F08080" },
  { name: "India Post Payments Bank", colorName: "LightCyan", colorCode: "E0FFFF" },
  { name: "Jio Payments Bank", colorName: "LightGoldenrodYellow", colorCode: "FAFAD2" },
  { name: "Google Pay", colorName: "LightGray", colorCode: "D3D3D3" },
  { name: "Amazon Pay", colorName: "LightGreen", colorCode: "90EE90" },
  { name: "PayTM Payments Bank", colorName: "LightPink", colorCode: "FFB6C1" },
  { name: "Bank of America India", colorName: "LightSalmon", colorCode: "FFA07A" },
  { name: "ING Vysya Bank", colorName: "LightSeaGreen", colorCode: "20B2AA" },
  { name: "Mizuho Bank India", colorName: "LightSkyBlue", colorCode: "87CEFA" },
  { name: "Sumitomo Mitsui Bank", colorName: "LightSlateGray", colorCode: "778899" },
  { name: "UBS India", colorName: "LightSteelBlue", colorCode: "B0C4DE" },
  { name: "Credit Suisse India", colorName: "LightYellow", colorCode: "FFFFE0" },
  { name: "JPMorgan Chase Bank India", colorName: "Linen", colorCode: "FAF0E6" },
  { name: "MUFG Bank India", colorName: "MediumAquamarine", colorCode: "66CDAA" },
  { name: "Barclays Bank India", colorName: "MediumBlue", colorCode: "0000CD" },
];

function normalizeInstitution(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(bank|account|credit|card|india|limited|ltd|payments|payment)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findBankColor(value?: string | null) {
  const normalized = normalizeInstitution(String(value ?? ""));
  if (!normalized) return null;

  return bankColors.find((bank) => {
    const bankName = normalizeInstitution(bank.name);
    return normalized.includes(bankName) || bankName.includes(normalized);
  }) ?? null;
}

export function getBankThemeStyle(value?: string | null): CSSProperties {
  const color = findBankColor(value)?.colorCode ?? "22C55E";
  const hex = `#${color}`;
  return {
    background: `linear-gradient(135deg, ${hex}26 0%, ${hex}18 48%, rgba(15, 23, 42, 0.92) 100%)`,
    borderColor: `${hex}66`,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 14px 30px ${hex}14`,
  };
}
import type { CSSProperties } from "react";
