import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold transition-all duration-150 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-to-b from-primary to-primary/80 text-primary-foreground shadow-glow hover:brightness-110',
        secondary: 'bg-foreground/[0.07] text-foreground hover:bg-foreground/[0.12]',
        outline: 'border border-foreground/15 bg-transparent hover:bg-foreground/[0.06]',
        ghost: 'hover:bg-foreground/[0.07]',
        danger: 'bg-danger/15 text-danger hover:bg-danger/25',
      },
      size: { sm: 'h-9 px-3.5', md: 'h-11 px-4', lg: 'h-[52px] px-5 text-base', icon: 'h-10 w-10 rounded-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = 'Button';
