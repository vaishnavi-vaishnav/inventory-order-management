import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { formatMoney } from "@/lib/currency";
import { PageHeader, EmptyState } from "@/components/Common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Trash, Users, Eye } from "@phosphor-icons/react";
import { toast } from "sonner";

const EMPTY = { full_name: "", email: "", phone: "", address: "" };

const STATUS_VARIANT = {
  pending: "secondary",
  confirmed: "default",
  processing: "default",
  shipped: "default",
  delivered: "default",
  cancelled: "secondary",
  returned: "secondary",
  refunded: "secondary",
};

export default function CustomersPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/customers");
      setRows(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const openDetail = async (c) => {
    setViewing(c);
    setOrders([]);
    setOrdersLoading(true);
    try {
      const { data } = await api.get(`/customers/${c.id}/orders`);
      setOrders(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setOrdersLoading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/customers", {
        ...form,
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        address: form.address.trim() || null,
      });
      toast.success("Customer created");
      setOpen(false);
      setForm(EMPTY);
      refresh();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete customer "${c.full_name}"?`)) return;
    try {
      await api.delete(`/customers/${c.id}`);
      toast.success("Customer deleted");
      if (viewing?.id === c.id) setViewing(null);
      refresh();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  return (
    <div>
      <PageHeader
        section="Directory"
        title="Customers"
        description="Maintain your customer roster. Email is unique per customer."
        actions={
          <Button
            onClick={() => {
              setForm(EMPTY);
              setOpen(true);
            }}
            data-testid="add-customer-button"
            className="rounded-sm hover:-translate-y-[1px] transition-transform"
          >
            <Plus size={16} className="mr-2" />
            New Customer
          </Button>
        }
      />

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No customers yet"
          description="Add your first customer to get started."
        />
      ) : (
        <div className="surface-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-data-label">Name</TableHead>
                <TableHead className="text-data-label">Email</TableHead>
                <TableHead className="text-data-label">Phone</TableHead>
                <TableHead className="text-data-label">Address</TableHead>
                <TableHead className="text-data-label text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} data-testid={`customer-row-${c.email}`}>
                  <TableCell className="font-medium">{c.full_name}</TableCell>
                  <TableCell className="font-mono text-sm">{c.email}</TableCell>
                  <TableCell className="font-mono text-sm">{c.phone}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.address || "—"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openDetail(c)}
                      data-testid={`view-customer-${c.email}`}
                    >
                      <Eye size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(c)}
                      data-testid={`delete-customer-${c.email}`}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm sm:max-w-lg" data-testid="customer-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">New Customer</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-data-label">Full Name</Label>
              <Input
                required
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                data-testid="customer-name-input"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-data-label">Email</Label>
                <Input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  data-testid="customer-email-input"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-data-label">Phone</Label>
                <Input
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  data-testid="customer-phone-input"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-data-label">Address (optional)</Label>
              <Textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                rows={2}
                data-testid="customer-address-input"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy} data-testid="customer-submit-button">
                {busy ? "Saving…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="rounded-sm sm:max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="customer-view-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">{viewing?.full_name}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DetailField label="Email" value={<span className="font-mono text-sm">{viewing.email}</span>} />
                <DetailField label="Phone" value={<span className="font-mono text-sm">{viewing.phone}</span>} />
                <DetailField label="Address" value={viewing.address || "—"} />
                <DetailField
                  label="Member since"
                  value={new Date(viewing.created_at).toLocaleDateString()}
                />
              </div>

              <div>
                <div className="text-data-label mb-3 pb-2 border-b border-border">
                  Order History ({orders.length})
                </div>
                {ordersLoading ? (
                  <div className="text-sm text-muted-foreground">Loading orders…</div>
                ) : orders.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No orders placed yet.</div>
                ) : (
                  <div className="surface-card overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-data-label">Order</TableHead>
                          <TableHead className="text-data-label">Date</TableHead>
                          <TableHead className="text-data-label text-right">Items</TableHead>
                          <TableHead className="text-data-label text-right">Total</TableHead>
                          <TableHead className="text-data-label">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.map((o) => (
                          <TableRow key={o.id} data-testid={`customer-order-${o.id}`}>
                            <TableCell className="font-mono text-xs">{o.id.slice(0, 8)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(o.created_at).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-mono">{o.items.length}</TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {formatMoney(o.total_amount, "USD")}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={STATUS_VARIANT[o.status] || "secondary"}
                                className="rounded-none uppercase text-[10px] tracking-wider"
                              >
                                {o.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {orders.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {orders.map((o) => (
                      <div key={`items-${o.id}`} className="surface-card p-3 text-sm" data-testid={`customer-order-items-${o.id}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-xs text-muted-foreground">Order {o.id.slice(0, 8)}</span>
                          <span className="font-mono font-semibold">{formatMoney(o.total_amount, "USD")}</span>
                        </div>
                        <ul className="space-y-1 text-xs">
                          {o.items.map((it) => (
                            <li key={it.id} className="flex justify-between gap-4">
                              <span>
                                {it.product_name}
                                {it.variant_label ? ` (${it.variant_label})` : ""}
                                <span className="text-muted-foreground font-mono ml-1">×{it.quantity}</span>
                              </span>
                              <span className="font-mono shrink-0">{formatMoney(it.line_total, "USD")}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailField({ label, value }) {
  return (
    <div className="surface-card p-3">
      <div className="text-data-label">{label}</div>
      <div className="text-sm font-medium mt-1">{value}</div>
    </div>
  );
}
