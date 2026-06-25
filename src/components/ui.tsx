import clsx from "clsx";

export function Badge({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "blue" | "green" | "amber" | "red" | "gray";
}) {
  return <span className={clsx("badge", tone)}>{children}</span>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
