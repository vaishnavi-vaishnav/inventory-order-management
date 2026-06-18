import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { formatMoney } from "@/lib/currency";
import { PageHeader } from "@/components/Common";
import { Card } from "@/components/ui/card";
import {
  Package,
  Users,
  ShoppingCart,
  Warning,
  CurrencyDollar,
} from "@phosphor-icons/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CHART_COLORS = ["#059669", "#2563eb", "#d97706", "#7c3aed", "#dc2626", "#0891b2", "#4f46e5", "#ca8a04"];
const INVENTORY_COLORS = { Healthy: "#059669", "Low Stock": "#d97706", "Out of Stock": "#dc2626" };

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

function ChartCard({ title, subtitle, children, footer, testid, className = "" }) {
  return (
    <Card className={`surface-card rounded-sm overflow-hidden ${className}`} data-testid={testid}>
      <div className="px-5 py-4 border-b border-border">
        <div className="text-data-label">{subtitle}</div>
        <h2 className="font-heading text-lg font-bold tracking-tight mt-0.5">{title}</h2>
      </div>
      <div className="p-4 h-[260px]">{children}</div>
      {footer && <div className="px-4 pb-4 -mt-1">{footer}</div>}
    </Card>
  );
}

function ChartTooltip({ active, payload, label, valueFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-sm border border-border bg-background px-3 py-2 shadow-md text-sm">
      <div className="text-data-label text-xs mb-1">{label ?? payload[0]?.name}</div>
      <div className="font-mono font-semibold">{valueFormatter(payload[0].value)}</div>
    </div>
  );
}

function EmptyChart({ message }) {
  return (
    <div className="h-full grid place-items-center text-sm text-muted-foreground">
      {message}
    </div>
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

  const hasRevenue = useMemo(
    () => (data?.revenue_trend ?? []).some((p) => p.value > 0),
    [data],
  );
  const hasOrders = useMemo(
    () => (data?.orders_trend ?? []).some((p) => p.value > 0),
    [data],
  );
  const hasCategoryRevenue = (data?.revenue_by_category?.length ?? 0) > 0;
  const hasStatusData = (data?.order_status_breakdown?.length ?? 0) > 0;
  const hasInventoryData = (data?.inventory_health ?? []).some((p) => p.value > 0);

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
              ? formatMoney(data.total_revenue, "USD")
              : "—"
          }
          icon={CurrencyDollar}
          accent="bg-emerald-600 text-white"
          testid="stat-revenue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-8">
        <ChartCard
          title="Revenue Trend"
          subtitle="Last 6 months"
          testid="chart-revenue-trend"
          className="lg:col-span-2"
        >
          {hasRevenue ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.revenue_trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#059669" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#059669" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                />
                <Tooltip content={<ChartTooltip valueFormatter={(v) => formatMoney(v, "USD")} />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#059669"
                  strokeWidth={2}
                  fill="url(#revenueFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No revenue data yet — place orders to see trends." />
          )}
        </ChartCard>

        <ChartCard
          title="Inventory Health"
          subtitle="Stock distribution"
          testid="chart-inventory-health"
          footer={
            hasInventoryData ? (
              <div className="flex flex-wrap justify-center gap-3 text-xs">
                {data.inventory_health.map((item) => (
                  <div key={item.label} className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: INVENTORY_COLORS[item.label] }}
                    />
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-mono font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
            ) : null
          }
        >
          {hasInventoryData ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.inventory_health}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={82}
                  paddingAngle={3}
                  stroke="none"
                >
                  {data.inventory_health.map((entry) => (
                    <Cell key={entry.label} fill={INVENTORY_COLORS[entry.label] || CHART_COLORS[0]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v} products`} />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No products in catalog." />
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ChartCard title="Order Volume" subtitle="Orders per month" testid="chart-orders-trend">
          {hasOrders ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.orders_trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v} orders`} />} />
                <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No orders yet — volume will appear here." />
          )}
        </ChartCard>

        <ChartCard title="Order Status" subtitle="Pipeline breakdown" testid="chart-order-status">
          {hasStatusData ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.order_status_breakdown}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={95}
                  paddingAngle={2}
                  stroke="none"
                >
                  {data.order_status_breakdown.map((entry, i) => (
                    <Cell key={entry.label} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v} orders`} />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No orders to analyze." />
          )}
        </ChartCard>
      </div>

      {hasCategoryRevenue && (
        <div className="mt-4">
          <ChartCard title="Revenue by Category" subtitle="Top performing categories" testid="chart-revenue-category">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.revenue_by_category}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={120}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip valueFormatter={(v) => formatMoney(v, "USD")} />} />
                <Bar dataKey="value" fill="#7c3aed" radius={[0, 4, 4, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

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
                    {formatMoney(p.price, p.currency)}
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
