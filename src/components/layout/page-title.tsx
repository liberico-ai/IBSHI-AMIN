interface PageTitleProps {
  title: string;
  description: string;
}

export function PageTitle({ title, description }: PageTitleProps) {
  return (
    <div className="mb-5">
      <h2 className="text-[22px] font-bold mb-1" style={{ color: "var(--ibs-text)" }}>
        {title}
      </h2>
      <p className="text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
        {description}
      </p>
    </div>
  );
}
