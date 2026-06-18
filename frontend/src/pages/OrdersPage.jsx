import { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash, Eye, ShoppingCart, X } from "@phosphor-icons/react";
import { toast } from "sonner";

const STATUS_FLOW = {
  pending: ["confirmed", "processing", "cancelled"],
  confirmed: ["processing", "shipped", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "returned"],
  delivered: ["returned", "refunded"],
  returned: ["refunded"],
  cancelled: [],
  refunded: [],
};

const STATUS_COLORS = {
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  confirmed: "bg-blue-100 text-blue-800 border-blue-300",
  processing: "bg-indigo-100 text-indigo-800 border-indigo-300",
  shipped: "bg-violet-100 text-violet-800 border-violet-300",
  delivered: "bg-emerald-100 text-emerald-800 border-emerald-300",
  cancelled: "bg-zinc-200 text-zinc-700 border-zinc-300",
  returned: "bg-orange-100 text-orange-800 border-orange-300",
  refunded: "bg-rose-100 text-rose-800 border-rose-300",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState([{ product_id: "", quantity: 1 }]);
  const [busy, setBusy] = useState(false);

  const [detail, setDetail] = useState(null);

  const productMap = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products],
  );

  const total = useMemo(() => {
    return lines.reduce((sum, l) => {
      const p = productMap[l.product_id];
      const q = parseInt(l.quantity, 10) || 0;
      return sum + (p ? Number(p.price) * q : 0);
    }, 0);
  }, [lines, productMap]);

  const refresh = async () => {
    setLoading(true);
    try {
      const [o, p, c] = await Promise.all([
        api.get("/orders"),
        api.get("/products"),
        api.get("/customers"),
      ]);
      setOrders(o.data);
      setProducts(p.data);
      setCustomers(c.data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const resetForm = () => {
    setCustomerId("");
    setLines([{ product_id: "", quantity: 1 }]);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!customerId) {
      toast.error("Select a customer");
      return;
    }
    const valid = lines.filter((l) => l.product_id && parseInt(l.quantity, 10) > 0);
    if (valid.length === 0) {
      toast.error("Add at least one product line");
      return;
    }
    setBusy(true);
    try {
      await api.post("/orders", {
        customer_id: customerId,
        items: valid.map((l) => ({
          product_id: l.product_id,
          quantity: parseInt(l.quantity, 10),
        })),
      });
      toast.success("Order placed");
      setCreateOpen(false);
      resetForm();
      refresh();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (o) => {
    if (!window.confirm("Cancel this order? Stock will be restored.")) return;
    try {
      await api.delete(`/orders/${o.id}`);
      toast.success("Order cancelled");
      refresh();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const openDetail = async (o) => {
    try {
      const { data } = await api.get(`/orders/${o.id}`);
      setDetail(data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const changeStatus = async (o, newStatus) => {
    try {
      await api.patch(`/orders/${o.id}/status`, { status: newStatus });
      toast.success(`Order → ${newStatus}`);
      refresh();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  return (
    <div>
      <PageHeader
        section="Sales"
        title="Orders"
        description="Place new orders and review every transaction. Stock deducts on order placement."
        actions={
          <Button
            onClick={() => {
              resetForm();
              setCreateOpen(true);
            }}
            data-testid="add-order-button"
            className="rounded-sm hover:-translate-y-[1px] transition-transform"
          >
            <Plus size={16} className="mr-2" />
            New Order
          </Button>
        }
      />

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="No orders yet"
          description="Create your first order — you'll need at least one customer and one in-stock product."
        />
      ) : (
        <div className="surface-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-data-label">Order ID</TableHead>
                <TableHead className="text-data-label">Customer</TableHead>
                <TableHead className="text-data-label">Date</TableHead>
                <TableHead className="text-data-label text-right">Items</TableHead>
                <TableHead className="text-data-label text-right">Total</TableHead>
                <TableHead className="text-data-label">Status</TableHead>
                <TableHead className="text-data-label text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id} data-testid={`order-row-${o.id}`}>
                  <TableCell className="font-mono text-xs">{o.id.slice(0, 8)}</TableCell>
                  <TableCell className="font-medium">{o.customer_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {new Date(o.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {o.items.length}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    ${Number(o.total_amount).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        data-testid={`order-status-${o.id}`}
                        className={`inline-block uppercase text-[10px] font-bold tracking-wider border px-2 py-0.5 rounded-none ${STATUS_COLORS[o.status] || ""}`}
                      >
                        {o.status}
                      </span>
                      {STATUS_FLOW[o.status]?.length > 0 && (
                        <Select value="" onValueChange={(v) => changeStatus(o, v)}>
                          <SelectTrigger
                            className="h-7 w-[110px] rounded-sm text-xs"
                            data-testid={`order-status-trigger-${o.id}`}
                          >
                            <SelectValue placeholder="Advance →" />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_FLOW[o.status].map((s) => (
                              <SelectItem key={s} value={s} data-testid={`order-status-option-${o.id}-${s}`}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openDetail(o)}
                      data-testid={`view-order-${o.id}`}
                    >
                      <Eye size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(o)}
                      data-testid={`delete-order-${o.id}`}
                    >
                      <Trash size={16} className="text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create order dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-sm sm:max-w-2xl" data-testid="order-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">New Order</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-data-label">Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="rounded-sm" data-testid="order-customer-select">
                  <SelectValue placeholder="Choose a customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem
                      key={c.id}
                      value={c.id}
                      data-testid={`order-customer-option-${c.email}`}
                    >
                      {c.full_name} — {c.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-data-label">Line Items</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setLines([...lines, { product_id: "", quantity: 1 }])
                  }
                  data-testid="add-order-line-button"
                  className="rounded-sm"
                >
                  <Plus size={14} className="mr-1" /> Add line
                </Button>
              </div>
              <div className="space-y-2">
                {lines.map((l, idx) => {
                  const p = productMap[l.product_id];
                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 items-center"
                      data-testid={`order-line-${idx}`}
                    >
                      <div className="col-span-7">
                        <Select
                          value={l.product_id}
                          onValueChange={(v) => {
                            const next = [...lines];
                            next[idx] = { ...next[idx], product_id: v };
                            setLines(next);
                          }}
                        >
                          <SelectTrigger
                            className="rounded-sm"
                            data-testid={`order-line-${idx}-product-select`}
                          >
                            <SelectValue placeholder="Choose product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem
                                key={p.id}
                                value={p.id}
                                disabled={p.quantity === 0}
                              >
                                {p.name} ({p.sku}) — ${Number(p.price).toFixed(2)} ·{" "}
                                {p.quantity} in stock
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-3">
                        <Input
                          type="number"
                          min="1"
                          value={l.quantity}
                          onChange={(e) => {
                            const next = [...lines];
                            next[idx] = { ...next[idx], quantity: e.target.value };
                            setLines(next);
                          }}
                          className="font-mono"
                          data-testid={`order-line-${idx}-qty-input`}
                        />
                      </div>
                      <div className="col-span-1 text-right text-sm font-mono">
                        {p ? `$${(Number(p.price) * (parseInt(l.quantity, 10) || 0)).toFixed(2)}` : "—"}
                      </div>
                      <div className="col-span-1 text-right">
                        {lines.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                            data-testid={`remove-order-line-${idx}`}
                          >
                            <X size={14} />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-muted border border-border p-4 flex justify-between items-center">
              <span className="text-data-label">Order Total</span>
              <span
                className="font-heading text-2xl font-bold font-mono"
                data-testid="order-total-display"
              >
                ${total.toFixed(2)}
              </span>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy} data-testid="order-submit-button">
                {busy ? "Placing…" : "Place Order"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Order detail dialog */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="rounded-sm sm:max-w-2xl" data-testid="order-detail-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">Order Details</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-data-label">Order ID</div>
                  <div className="font-mono mt-1" data-testid="detail-order-id">{detail.id}</div>
                </div>
                <div>
                  <div className="text-data-label">Customer</div>
                  <div className="mt-1 font-medium">{detail.customer_name}</div>
                </div>
                <div>
                  <div className="text-data-label">Date</div>
                  <div className="mt-1 font-mono">
                    {new Date(detail.created_at).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-data-label">Status</div>
                  <div className="mt-1 uppercase text-xs font-bold tracking-wider">
                    {detail.status}
                  </div>
                </div>
              </div>

              <div className="surface-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-data-label">SKU</TableHead>
                      <TableHead className="text-data-label">Product</TableHead>
                      <TableHead className="text-data-label text-right">Unit</TableHead>
                      <TableHead className="text-data-label text-right">Qty</TableHead>
                      <TableHead className="text-data-label text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell className="font-mono text-sm">{it.product_sku}</TableCell>
                        <TableCell>{it.product_name}</TableCell>
                        <TableCell className="text-right font-mono">
                          ${Number(it.unit_price).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono">{it.quantity}</TableCell>
                        <TableCell className="text-right font-mono">
                          ${Number(it.line_total).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="bg-muted border border-border p-4 flex justify-between items-center">
                <span className="text-data-label">Order Total</span>
                <span className="font-heading text-2xl font-bold font-mono">
                  ${Number(detail.total_amount).toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
