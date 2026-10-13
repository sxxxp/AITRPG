export function Spinner({ label = '불러오는 중' }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function PageSpinner() {
  return (
    <div className="page-center">
      <Spinner />
    </div>
  );
}
