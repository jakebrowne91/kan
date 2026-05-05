import Image from "next/image";

export const BRAND_NAME = "GSD";

export const BrandLogo = ({ className }: { className?: string }) => (
  <Image
    src="/GSD.png"
    alt={BRAND_NAME}
    width={83}
    height={29}
    unoptimized
    className={className}
  />
);
