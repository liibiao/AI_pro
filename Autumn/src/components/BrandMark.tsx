interface BrandMarkProps {
  showName?: boolean;
}

export function BrandMark({ showName = true }: BrandMarkProps) {
  return (
    <div className="brand">
      <span className="brand__mark" aria-hidden="true" />
      {showName ? <span className="brand__name">Autumn.ai</span> : null}
    </div>
  );
}
