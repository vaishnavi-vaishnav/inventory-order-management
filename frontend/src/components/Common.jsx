export function PageHeader({ section, title, description, actions }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8 pb-6 border-b border-border">
      <div>
        <div className="text-data-label mb-2">/ {section}</div>
        <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight leading-none">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-3 max-w-xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="surface-card p-12 text-center">
      {Icon && (
        <div className="mx-auto mb-4 h-12 w-12 grid place-items-center bg-muted rounded-sm text-muted-foreground">
          <Icon size={24} />
        </div>
      )}
      <h3 className="font-heading text-lg font-semibold">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function StockBadge({ qty }) {
  let color = "bg-emerald-600";
  let label = "IN STOCK";
  if (qty === 0) {
    color = "bg-destructive";
    label = "OUT OF STOCK";
  } else if (qty <= 10) {
    color = "bg-amber-500";
    label = "LOW";
  }
  return (
    <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
