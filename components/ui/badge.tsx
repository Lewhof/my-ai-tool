import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-gray-700 bg-gray-800 text-gray-300',
        accent: 'border-accent-600/30 bg-accent-600/15 text-accent-400',
        success: 'border-green-600/30 bg-green-600/15 text-green-400',
        warning: 'border-yellow-600/30 bg-yellow-600/15 text-yellow-400',
        destructive: 'border-red-600/30 bg-red-600/15 text-red-400',
        info: 'border-blue-600/30 bg-blue-600/15 text-blue-400',
        purple: 'border-purple-600/30 bg-purple-600/15 text-purple-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
