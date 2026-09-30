/**
 * Loading state — PRODUCT_SPEC.md Section 4.2 + design.md Section 5.6.
 * 3 skeleton card, bentuk mengikuti card SKU asli, pulse 1.5s.
 */

const SKELETON_COUNT = 3;

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-skeleton rounded-sm bg-surface-raised ${className}`} />;
}

export function SkeletonList() {
  return (
    <div aria-live="polite" aria-busy="true">
      <p className="mb-3 text-body text-secondary">
        Menghitung data dari 3 platform...
      </p>
      <div className="flex flex-col gap-2">
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <div
            key={index}
            className="rounded-md border-l-[3px] border-l-subtle bg-surface p-3 shadow-card sm:p-4"
          >
            <SkeletonBlock className="h-[22px] w-24" />
            <SkeletonBlock className="mt-2 h-[25px] w-3/4" />
            <SkeletonBlock className="mt-2 h-[17px] w-1/3" />
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-subtle pt-3">
              <SkeletonBlock className="h-[38px] w-full" />
              <SkeletonBlock className="h-[38px] w-full" />
              <SkeletonBlock className="h-[38px] w-full" />
              <SkeletonBlock className="h-[38px] w-full" />
            </div>
            <SkeletonBlock className="mt-3 h-[21px] w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
