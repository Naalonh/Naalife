import {
  Banknote,
  Briefcase,
  Bus,
  Clapperboard,
  Ellipsis,
  GraduationCap,
  Gift,
  HeartPulse,
  Laptop,
  Receipt,
  ShoppingBag,
  Users,
  Utensils,
  Wallet,
  ArrowLeftRight,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  bus: Bus,
  'shopping-bag': ShoppingBag,
  'graduation-cap': GraduationCap,
  receipt: Receipt,
  clapperboard: Clapperboard,
  'heart-pulse': HeartPulse,
  users: Users,
  briefcase: Briefcase,
  ellipsis: Ellipsis,
  banknote: Banknote,
  laptop: Laptop,
  gift: Gift,
  wallet: Wallet,
  transfer: ArrowLeftRight,
};

export function CategoryIcon({
  icon,
  color,
  size = 'md',
}: {
  icon: string | undefined;
  color?: string;
  size?: 'sm' | 'md';
}) {
  const Icon = (icon && ICONS[icon]) || Ellipsis;
  // legacy emerald category colour maps to the cyan palette
  const tint = !color ? '#94a3b8' : color.toLowerCase() === '#10b981' ? '#22d3ee' : color;
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  return (
    <span
      className={`inline-flex ${dim} shrink-0 items-center justify-center rounded-xl`}
      style={{ backgroundColor: `${tint}26`, color: tint }}
    >
      <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
    </span>
  );
}
