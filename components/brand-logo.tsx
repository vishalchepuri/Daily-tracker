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
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#06101d] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14),0_10px_30px_rgba(34,197,94,0.2)]",
          currentSize.mark
        )}
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[linear-gradient(145deg,#052e2b_0%,#047857_48%,#22c55e_100%)]" />
        <div className="absolute inset-[3px] rounded-[11px] bg-[#020817]/18" />
        <svg viewBox="0 0 64 64" className="relative h-[68%] w-[68%]" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10B981" />
              <stop offset="50%" stopColor="#06B6D4" />
              <stop offset="100%" stopColor="#3B82F6" />
            </linearGradient>
          </defs>
          <path
            d="M20 38c-5-5-5-14 0-19s14-5 19 0l7 7"
            stroke="url(#logo-gradient)"
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M44 26c5 5 5 14 0 19s-14 5-19 0l-7-7"
            stroke="url(#logo-gradient)"
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="32" cy="32" r="4" fill="#FFFFFF" />
        </svg>
      </div>
      {showText && <span className={cn("font-display font-bold tracking-tight", currentSize.text)}>Dayza</span>}
    </div>
  );
}
