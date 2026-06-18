import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { PageHeader } from "@/components/Common";
import { Card } from "@/components/ui/card";
import {
  Package,
  Users,
  ShoppingCart,
  Warning,
  CurrencyDollar,
} from "@phosphor-icons/react";

function Stat({ label, value, icon: Icon, accent, testid }) {
  return (
    <Card data-testid={testid} className="surface-card p-5 rounded-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-data-label">{label}</div>
          <div className="font-heading text-3xl font-bold tracking-tight mt-3 font-mono">
            {value}
          </div>
        </div>
        <div
          className={`h-9 w-9 grid place-items-center rounded-sm ${
            accent || "bg-primary text-primary-foreground"
          }`}
        >
          <Icon size={18} weight="bold" />
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .get("/dashboard")
      .then(({ data }) => alive && setData(data))
      .catch((e) =>
        alive && setErr(e?.response?.data?.detail || "Failed to load dashboard"),
      );
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div>
      <PageHeader
        section="Overview"
        title="Operations Dashboard"
        description="Real-time snapshot of inventory health, customer base, and order velocity."
      />

      {err && (
        <div className="text-sm text-destructive mb-4" data-testid="dashboard-error">
          {err}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-fade">
        <Stat
          label="Total Products"
          value={data?.total_products ?? "—"}
          icon={Package}
          testid="stat-products"
        />
        <Stat
          label="Customers"
          value={data?.total_customers ?? "—"}
          icon={Users}
          testid="stat-customers"
        />
        <Stat
          label="Orders Placed"
          value={data?.total_orders ?? "—"}
          icon={ShoppingCart}
          testid="stat-orders"
        />
        <Stat
          label="Revenue"
          value={
            data
              ? `$${Number(data.total_revenue).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : "—"
          }
          icon={CurrencyDollar}
          accent="bg-emerald-600 text-white"
          testid="stat-revenue"
        />
      </div>

      <Card className="surface-card mt-8 rounded-sm" data-testid="low-stock-card">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-data-label">Inventory Alerts</div>
            <h2 className="font-heading text-xl font-bold tracking-tight mt-1">
              Low Stock Products
            </h2>
          </div>
          <div className="flex items-center gap-2 text-sm text-amber-600">
            <Warning size={18} weight="bold" />
            <span className="font-mono">{data?.low_stock_count ?? 0} flagged</span>
          </div>
        </div>
        {data?.low_stock_products?.length ? (
          <div className="divide-y divide-border">
            {data.low_stock_products.map((p) => (
              <div
                key={p.id}
                className="px-5 py-3 flex items-center justify-between hover:bg-muted/50"
                data-testid={`low-stock-row-${p.sku}`}
              >
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs font-mono text-muted-foreground">{p.sku}</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono text-muted-foreground">
                    ${Number(p.price).toFixed(2)}
                  </span>
                  <span
                    className={`font-mono text-sm font-semibold ${
                      p.quantity === 0 ? "text-destructive" : "text-amber-600"
                    }`}
                  >
                    {p.quantity} units
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            All stock levels healthy.
          </div>
        )}
        <div className="px-5 py-3 border-t border-border">
          <Link
            to="/products"
            className="text-sm text-primary font-medium hover:underline"
            data-testid="dashboard-manage-products-link"
          >
            Manage products →
          </Link>
        </div>
      </Card>
    </div>
  );
}
