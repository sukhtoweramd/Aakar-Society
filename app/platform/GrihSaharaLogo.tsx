// The GrihSahara logo (a house held in a supporting curve). Drawn here once; used on the product owner sign-in screen.
export default function GrihSaharaLogo({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GrihSahara logo">
      <defs><linearGradient id="gs-logo-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2cc08f" /><stop offset="1" stopColor="#0e7c86" /></linearGradient></defs>
      <rect width="120" height="120" rx="28" fill="url(#gs-logo-grad)" />
      <path d="M24 60 L60 28 L96 60" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M34 56 V90 H86 V56" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="60" cy="72" r="8" fill="#f2a93b" />
      <path d="M16 98 Q60 126 104 98" fill="none" stroke="#f2a93b" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}
