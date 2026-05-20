import { cn } from "@/lib/utils";

type BrandLogoProps = {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
};

const sizes = {
  sm: { mark: "h-9 w-9", text: "text-lg" },
  md: { mark: "h-10 w-10", text: "text-2xl" },
  lg: { mark: "h-12 w-12", text: "text-3xl" },
};

export function BrandLogo({ size = "md", showText = true, className }: BrandLogoProps) {
  const currentSize = sizes[size];

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#06101d] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14),0_10px_30px_rgba(34,197,94,0.22)]",
          currentSize.mark
        )}
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(52,211,153,0.95),transparent_22%),linear-gradient(145deg,#0f172a_0%,#064e3b_52%,#22c55e_100%)]" />
        <div className="absolute inset-[3px] rounded-[11px] bg-[#06101d]/78" />
        <svg viewBox="0 0 64 64" className="relative h-[78%] w-[78%]" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 42c8.8 8 27.2 8 36 0" stroke="#22c55e" strokeWidth="3.8" strokeLinecap="round" />
          <path d="M17 23c6.5-9 23.5-9 30 0" stroke="#86efac" strokeWidth="3.8" strokeLinecap="round" />
          <path d="M18 30c0-7.7 6.3-14 14-14s14 6.3 14 14v10c0 7.7-6.3 14-14 14s-14-6.3-14-14V30Z" fill="#071424" stroke="white" strokeWidth="4.4" strokeLinejoin="round" />
          <path d="M24 34c3.8-2.8 12.2-2.8 16 0" stroke="#22c55e" strokeWidth="5.2" strokeLinecap="round" />
          <circle cx="25.5" cy="34" r="1.9" fill="#ecfeff" />
          <circle cx="38.5" cy="34" r="1.9" fill="#ecfeff" />
          <path d="M28 43h8" stroke="#86efac" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="13" cy="26" r="3.5" fill="#22c55e" />
          <circle cx="51" cy="26" r="3.5" fill="#22c55e" />
          <path d="M50 11l1.9 4.1 4.1 1.9-4.1 1.9L50 24l-1.9-4.1L44 18l4.1-1.9L50 11Z" fill="#a7f3d0" />
        </svg>
      </div>
      {showText && <span className={cn("font-display font-bold tracking-tight", currentSize.text)}>Dayza</span>}
    </div>
  );
}
