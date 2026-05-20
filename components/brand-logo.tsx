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
        <svg viewBox="0 0 64 64" className="relative h-[72%] w-[72%]" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M32 7l5.4 15.6L53 28l-15.6 5.4L32 49l-5.4-15.6L11 28l15.6-5.4L32 7Z" fill="#F8FAFC" />
          <path d="M32 17l2.9 8.1L43 28l-8.1 2.9L32 39l-2.9-8.1L21 28l8.1-2.9L32 17Z" fill="#22C55E" />
          <circle cx="15" cy="47" r="4" fill="#BBF7D0" />
          <circle cx="49" cy="17" r="3.2" fill="#BBF7D0" />
          <path d="M20 45c8.3 4.8 17.7 4.8 26 0" stroke="#DCFCE7" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>
      {showText && <span className={cn("font-display font-bold tracking-tight", currentSize.text)}>Dayza</span>}
    </div>
  );
}
