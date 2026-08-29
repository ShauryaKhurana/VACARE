export function RatingHeadline({
  combinedRating,
  monthlyAmount,
}: {
  combinedRating: number;
  monthlyAmount: number;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-5 text-center">
      <p className="text-sm text-text-secondary">Your combined rating</p>
      <p className="mt-1 text-4xl font-medium text-text-primary">{combinedRating}%</p>
      {monthlyAmount > 0 ? (
        <p className="mt-2 text-sm text-text-secondary">
          About ${monthlyAmount.toFixed(2)} per month, tax-free
        </p>
      ) : (
        <p className="mt-2 text-sm text-text-secondary">No conditions were granted this time</p>
      )}
    </div>
  );
}
