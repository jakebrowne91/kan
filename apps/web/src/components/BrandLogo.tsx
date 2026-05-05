import Image from "next/image";

export const BRAND_NAME = "GSD";

export const BrandLogo = ({ className }: { className?: string }) => (
  <Image
    src="/brand-mark.svg"
    alt={BRAND_NAME}
    width={71}
    height={16}
    unoptimized
    className={className}
  />
);
