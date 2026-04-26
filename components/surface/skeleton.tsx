import { cn } from '@/lib/utils';

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

// Shimmer skeleton primitive. Use as a low-level placeholder for any
// loading region while data hydrates.
export function Skeleton({ className, ...rest }: SkeletonProps) {
  return (
    <div
      {...rest}
      className={cn(
        'animate-pulse rounded-md bg-secondary/60 relative overflow-hidden',
        className
      )}
    />
  );
}

// Stat tile skeleton — matches the StatTile shape so the grid doesn't reflow
// when data lands.
export function StatTileSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Skeleton className="w-4 h-4" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-8 w-20" />
    </div>
  );
}

// Card row skeleton — for list items in panes (recent sessions, briefing items, etc.)
export function CardRowSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-3.5 flex items-center gap-3">
      <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}
