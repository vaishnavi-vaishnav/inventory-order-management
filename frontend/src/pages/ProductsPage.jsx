import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { formatMoney, CURRENCIES } from "@/lib/currency";
import { PageHeader, EmptyState } from "@/components/Common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import { Plus, PencilSimple, Trash, Package, Eye, FileArrowUp } from "@phosphor-icons/react";
import { toast } from "sonner";

const EMPTY = {
  // Identity
  name: "", sku: "", barcode: "", category: "", brand: "",
  // Copy
  description: "", short_description: "",
  // Pricing
  price: "", cost_price: "", discount_price: "", tax_rate: "0", currency: "USD",
  // Inventory
  quantity: "", reorder_level: "10", unit: "pcs",
  // Logistics
  weight_kg: "", length_cm: "", width_cm: "", height_cm: "",
  color: "", size: "",
  // Marketing
  image_url: "", tags: "", supplier: "", status: "active",
};

function stockState(p) {
  if (p.quantity === 0) return { color: "bg-destructive", label: "OUT OF STOCK", text: "text-destructive" };
  if (p.quantity <= p.reorder_level) return { color: "bg-amber-500", label: "LOW", text: "text-amber-600" };
  return { color: "bg-emerald-600", label: "IN STOCK", text: "text-emerald-700" };
}

function toNumOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const NONE = "__none__";

export default function ProductsPage() {
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/products");
      setRows(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = useCallback(async () => {
    try {
      const { data } = await api.get("/categories");
      setCategories(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  }, []);

  useEffect(() => { refresh(); loadCategories(); }, [loadCategories]);

  const categoryOptions = useMemo(() => {
    const names = new Set(categories.map((c) => c.name));
    if (form.category && !names.has(form.category)) {
      names.add(form.category);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [categories, form.category]);

  const currencyOptions = useMemo(() => {
    const codes = new Set(CURRENCIES.map((c) => c.code));
    const extra = (form.currency || "USD").toUpperCase();
    if (!codes.has(extra)) {
      return [{ code: extra, label: extra }, ...CURRENCIES];
    }
    return CURRENCIES;
  }, [form.currency]);

  const catalogStats = useMemo(() => {
    const low = rows.filter((p) => p.quantity > 0 && p.quantity <= p.reorder_level).length;
    const out = rows.filter((p) => p.quantity === 0).length;
    const active = rows.filter((p) => p.status === "active").length;
    return { total: rows.length, low, out, active };
  }, [rows]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    loadCategories();
    setOpen(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    loadCategories();
    setForm({
      name: p.name || "", sku: p.sku || "", barcode: p.barcode || "",
      category: p.category || "", brand: p.brand || "",
      description: p.description || "", short_description: p.short_description || "",
      price: String(p.price ?? ""), cost_price: p.cost_price != null ? String(p.cost_price) : "",
      discount_price: p.discount_price != null ? String(p.discount_price) : "",
      tax_rate: String(p.tax_rate ?? 0), currency: p.currency || "USD",
      quantity: String(p.quantity ?? ""), reorder_level: String(p.reorder_level ?? 10),
      unit: p.unit || "pcs",
      weight_kg: p.weight_kg != null ? String(p.weight_kg) : "",
      length_cm: p.length_cm != null ? String(p.length_cm) : "",
      width_cm: p.width_cm != null ? String(p.width_cm) : "",
      height_cm: p.height_cm != null ? String(p.height_cm) : "",
      color: p.color || "", size: p.size || "",
      image_url: p.image_url || "", tags: p.tags || "",
      supplier: p.supplier || "", status: p.status || "active",
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim().toUpperCase(),
      barcode: form.barcode.trim() || null,
      category: form.category && form.category !== NONE ? form.category.trim() : null,
      brand: form.brand.trim() || null,
      description: form.description.trim() || null,
      short_description: form.short_description.trim() || null,
      price: Number(form.price),
      cost_price: toNumOrNull(form.cost_price),
      discount_price: toNumOrNull(form.discount_price),
      tax_rate: Number(form.tax_rate || 0),
      currency: (form.currency || "USD").toUpperCase(),
      quantity: parseInt(form.quantity, 10),
      reorder_level: parseInt(form.reorder_level || 10, 10),
      unit: form.unit || "pcs",
      weight_kg: toNumOrNull(form.weight_kg),
      length_cm: toNumOrNull(form.length_cm),
      width_cm: toNumOrNull(form.width_cm),
      height_cm: toNumOrNull(form.height_cm),
      color: form.color.trim() || null,
      size: form.size.trim() || null,
      image_url: form.image_url.trim() || null,
      tags: form.tags.trim() || null,
      supplier: form.supplier.trim() || null,
      status: form.status || "active",
    };
    try {
      let saved;
      if (editing) {
        const { data } = await api.put(`/products/${editing.id}`, payload);
        saved = data;
        toast.success("Product updated");
      } else {
        const { data } = await api.post("/products", payload);
        saved = data;
        toast.success("Product created");
      }
      setOpen(false);
      if (viewing?.id === saved.id) {
        setViewing(saved);
      }
      refresh();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete product "${p.name}"?`)) return;
    try {
      await api.delete(`/products/${p.id}`);
      toast.success("Product deleted");
      refresh();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const f = (k, val) => setForm((s) => ({ ...s, [k]: val }));

  return (
    <div>
      <PageHeader
        section="Catalog"
        title="Products"
        description="Manage your full product catalog — pricing, inventory, categories, and variants."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-sm" asChild>
              <Link to="/bulk-import" data-testid="products-bulk-import-link">
                <FileArrowUp size={16} className="mr-2" />Bulk Import
              </Link>
            </Button>
            <Button onClick={openCreate} data-testid="add-product-button" className="rounded-sm hover:-translate-y-[1px] transition-transform">
              <Plus size={16} className="mr-2" />New Product
            </Button>
          </div>
        }
      />

      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6" data-testid="catalog-stats">
          <StatPill label="Total" value={catalogStats.total} />
          <StatPill label="Active" value={catalogStats.active} accent="text-emerald-700" />
          <StatPill label="Low stock" value={catalogStats.low} accent="text-amber-600" />
          <StatPill label="Out of stock" value={catalogStats.out} accent="text-destructive" />
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Package} title="No products yet" description="Add products one at a time or import many from a spreadsheet."
          action={
            <div className="flex flex-wrap gap-2 justify-center">
              <Button onClick={openCreate} data-testid="empty-add-product-button" className="rounded-sm">Add Product</Button>
              <Button variant="outline" asChild className="rounded-sm">
                <Link to="/bulk-import">Bulk Import</Link>
              </Button>
            </div>
          } />
      ) : (
        <div className="surface-card overflow-hidden" data-testid="products-table-wrapper">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-data-label">Image</TableHead>
                <TableHead className="text-data-label">SKU</TableHead>
                <TableHead className="text-data-label">Name</TableHead>
                <TableHead className="text-data-label">Category</TableHead>
                <TableHead className="text-data-label">Brand</TableHead>
                <TableHead className="text-data-label text-right">Price</TableHead>
                <TableHead className="text-data-label text-right">Stock</TableHead>
                <TableHead className="text-data-label">Status</TableHead>
                <TableHead className="text-data-label text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const s = stockState(p);
                return (
                  <TableRow key={p.id} data-testid={`product-row-${p.sku}`}>
                    <TableCell>
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="h-10 w-10 object-cover rounded-sm border border-border" />
                      ) : (
                        <div className="h-10 w-10 grid place-items-center bg-muted rounded-sm text-muted-foreground">
                          <Package size={16} />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{p.sku}</TableCell>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      {p.short_description && (
                        <div className="text-xs text-muted-foreground line-clamp-1">{p.short_description}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{p.category || "—"}</TableCell>
                    <TableCell className="text-sm">{p.brand || "—"}</TableCell>
                    <TableCell className="text-right font-mono">
                      {p.discount_price != null ? (
                        <div>
                          <div className="font-semibold">{formatMoney(p.discount_price, p.currency)}</div>
                          <div className="text-xs text-muted-foreground line-through">{formatMoney(p.price, p.currency)}</div>
                        </div>
                      ) : (
                        <div>{formatMoney(p.price, p.currency)}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className={`font-mono font-semibold ${s.text}`}>{p.quantity} {p.unit}</div>
                      <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${s.color}`} />{s.label}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === "active" ? "default" : "secondary"} className="rounded-none uppercase text-[10px] tracking-wider">
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" onClick={() => setViewing(p)} data-testid={`view-product-${p.sku}`}><Eye size={16} /></Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)} data-testid={`edit-product-${p.sku}`}><PencilSimple size={16} /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(p)} data-testid={`delete-product-${p.sku}`}><Trash size={16} className="text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm sm:max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="product-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">{editing ? "Edit Product" : "New Product"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-6">
            <FieldGroup title="Identity">
              <Field label="Name *"><Input required value={form.name} onChange={(e) => f("name", e.target.value)} data-testid="product-name-input" /></Field>
              <Field label="SKU *"><Input required value={form.sku} onChange={(e) => f("sku", e.target.value.toUpperCase())} className="font-mono" data-testid="product-sku-input" /></Field>
              <Field label="Barcode (EAN/UPC)"><Input value={form.barcode} onChange={(e) => f("barcode", e.target.value)} className="font-mono" data-testid="product-barcode-input" /></Field>
              <Field label="Category">
                <Select
                  value={form.category || NONE}
                  onValueChange={(v) => f("category", v === NONE ? "" : v)}
                >
                  <SelectTrigger className="rounded-sm" data-testid="product-category-select">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No category</SelectItem>
                    {categoryOptions.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Brand"><Input value={form.brand} onChange={(e) => f("brand", e.target.value)} data-testid="product-brand-input" /></Field>
              <Field label="Supplier"><Input value={form.supplier} onChange={(e) => f("supplier", e.target.value)} data-testid="product-supplier-input" /></Field>
            </FieldGroup>

            <FieldGroup title="Content">
              <Field className="col-span-2" label="Short description">
                <Input value={form.short_description} onChange={(e) => f("short_description", e.target.value)} data-testid="product-short-desc-input" />
              </Field>
              <Field className="col-span-2" label="Full description">
                <Textarea value={form.description} onChange={(e) => f("description", e.target.value)} rows={3} data-testid="product-description-input" />
              </Field>
              <Field className="col-span-2" label="Image URL">
                <Input value={form.image_url} onChange={(e) => f("image_url", e.target.value)} placeholder="https://…" data-testid="product-image-url-input" />
              </Field>
              <Field className="col-span-2" label="Tags (comma separated)">
                <Input value={form.tags} onChange={(e) => f("tags", e.target.value)} placeholder="wireless,office,bluetooth" data-testid="product-tags-input" />
              </Field>
            </FieldGroup>

            <FieldGroup title="Pricing">
              <Field label="Selling price *"><Input required type="number" step="0.01" min="0" value={form.price} onChange={(e) => f("price", e.target.value)} data-testid="product-price-input" /></Field>
              <Field label="Cost price"><Input type="number" step="0.01" min="0" value={form.cost_price} onChange={(e) => f("cost_price", e.target.value)} data-testid="product-cost-price-input" /></Field>
              <Field label="Discount price"><Input type="number" step="0.01" min="0" value={form.discount_price} onChange={(e) => f("discount_price", e.target.value)} data-testid="product-discount-price-input" /></Field>
              <Field label="Tax rate (%)"><Input type="number" step="0.01" min="0" max="100" value={form.tax_rate} onChange={(e) => f("tax_rate", e.target.value)} data-testid="product-tax-rate-input" /></Field>
              <Field label="Currency">
                <Select value={form.currency || "USD"} onValueChange={(v) => f("currency", v)}>
                  <SelectTrigger className="rounded-sm font-mono" data-testid="product-currency-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencyOptions.map(({ code, label }) => (
                      <SelectItem key={code} value={code}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status} onValueChange={(v) => f("status", v)}>
                  <SelectTrigger className="rounded-sm" data-testid="product-status-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>

            <FieldGroup title="Inventory">
              <Field label="Quantity in stock *"><Input required type="number" min="0" value={form.quantity} onChange={(e) => f("quantity", e.target.value)} data-testid="product-quantity-input" /></Field>
              <Field label="Reorder level"><Input type="number" min="0" value={form.reorder_level} onChange={(e) => f("reorder_level", e.target.value)} data-testid="product-reorder-input" /></Field>
              <Field label="Unit"><Input value={form.unit} onChange={(e) => f("unit", e.target.value)} placeholder="pcs / kg / box" data-testid="product-unit-input" /></Field>
            </FieldGroup>

            <FieldGroup title="Logistics & Variants">
              <Field label="Weight (kg)"><Input type="number" step="0.001" min="0" value={form.weight_kg} onChange={(e) => f("weight_kg", e.target.value)} data-testid="product-weight-input" /></Field>
              <Field label="Length (cm)"><Input type="number" step="0.01" min="0" value={form.length_cm} onChange={(e) => f("length_cm", e.target.value)} data-testid="product-length-input" /></Field>
              <Field label="Width (cm)"><Input type="number" step="0.01" min="0" value={form.width_cm} onChange={(e) => f("width_cm", e.target.value)} data-testid="product-width-input" /></Field>
              <Field label="Height (cm)"><Input type="number" step="0.01" min="0" value={form.height_cm} onChange={(e) => f("height_cm", e.target.value)} data-testid="product-height-input" /></Field>
              <Field label="Color"><Input value={form.color} onChange={(e) => f("color", e.target.value)} data-testid="product-color-input" /></Field>
              <Field label="Size"><Input value={form.size} onChange={(e) => f("size", e.target.value)} placeholder='S / M / L / 27"' data-testid="product-size-input" /></Field>
            </FieldGroup>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy} data-testid="product-submit-button">
                {busy ? "Saving…" : editing ? "Update Product" : "Create Product"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View dialog */}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="rounded-sm sm:max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="product-view-dialog">
          <DialogHeader><DialogTitle className="font-heading">{viewing?.name}</DialogTitle></DialogHeader>
          {viewing && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4">
                {viewing.image_url ? (
                  <img src={viewing.image_url} alt={viewing.name} className="h-40 w-40 object-cover rounded-sm border border-border" />
                ) : (
                  <div className="h-40 w-40 grid place-items-center bg-muted rounded-sm text-muted-foreground"><Package size={32} /></div>
                )}
                <div className="space-y-1.5">
                  <KV k="SKU" v={<span className="font-mono">{viewing.sku}</span>} />
                  <KV k="Barcode" v={<span className="font-mono">{viewing.barcode || "—"}</span>} />
                  <KV k="Category" v={viewing.category || "—"} />
                  <KV k="Brand" v={viewing.brand || "—"} />
                  <KV k="Supplier" v={viewing.supplier || "—"} />
                  <KV k="Status" v={viewing.status.toUpperCase()} />
                </div>
              </div>
              {viewing.description && (
                <div>
                  <div className="text-data-label mb-1">Description</div>
                  <p className="text-sm">{viewing.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Price" val={formatMoney(viewing.price, viewing.currency)} />
                <Stat label="Discount" val={viewing.discount_price != null ? formatMoney(viewing.discount_price, viewing.currency) : "—"} />
                <Stat label="Cost" val={viewing.cost_price != null ? formatMoney(viewing.cost_price, viewing.currency) : "—"} />
                <Stat label="Tax" val={`${Number(viewing.tax_rate).toFixed(2)}%`} />
                <Stat label="Stock" val={`${viewing.quantity} ${viewing.unit}`} />
                <Stat label="Reorder at" val={`${viewing.reorder_level}`} />
                <Stat label="Weight" val={viewing.weight_kg != null ? `${viewing.weight_kg} kg` : "—"} />
                <Stat label="Dimensions" val={viewing.length_cm || viewing.width_cm || viewing.height_cm ? `${viewing.length_cm ?? "?"}×${viewing.width_cm ?? "?"}×${viewing.height_cm ?? "?"} cm` : "—"} />
                <Stat label="Color" val={viewing.color || "—"} />
                <Stat label="Size" val={viewing.size || "—"} />
                <Stat label="Currency" val={viewing.currency} />
                <Stat label="Tags" val={viewing.tags || "—"} />
              </div>
              <VariantsManager productId={viewing.id} currency={viewing.currency} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatPill({ label, value, accent = "" }) {
  return (
    <div className="surface-card rounded-sm px-4 py-3 border border-border">
      <div className="text-data-label text-[10px] uppercase tracking-wider">{label}</div>
      <div className={`font-heading text-2xl font-bold font-mono mt-1 ${accent}`}>{value}</div>
    </div>
  );
}

function FieldGroup({ title, children }) {
  return (
    <section>
      <div className="text-data-label mb-3 pb-2 border-b border-border">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

function Field({ label, children, className = "" }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-data-label">{label}</Label>
      {children}
    </div>
  );
}

function KV({ k, v }) {
  return (
    <div className="flex gap-3 text-sm">
      <div className="text-data-label w-24 shrink-0 pt-0.5">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}

function Stat({ label, val }) {
  return (
    <div className="surface-card p-3">
      <div className="text-data-label">{label}</div>
      <div className="font-mono text-sm mt-1 font-medium">{val}</div>
    </div>
  );
}

function VariantsManager({ productId, currency = "USD" }) {
  const [variants, setVariants] = useState([]);
  const [form, setForm] = useState({ sku: "", color: "", size: "", price: "", quantity: "0" });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get(`/products/${productId}/variants`);
      setVariants(data);
    } catch {}
  }, [productId]);

  useEffect(() => { refresh(); }, [refresh]);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/products/${productId}/variants`, {
        sku: form.sku.trim().toUpperCase(),
        color: form.color.trim() || null,
        size: form.size.trim() || null,
        price: form.price ? Number(form.price) : null,
        quantity: parseInt(form.quantity, 10) || 0,
      });
      toast.success("Variant added");
      setForm({ sku: "", color: "", size: "", price: "", quantity: "0" });
      refresh();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (v) => {
    if (!window.confirm(`Delete variant ${v.sku}?`)) return;
    try {
      await api.delete(`/products/${productId}/variants/${v.id}`);
      refresh();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  return (
    <div className="border-t border-border pt-5" data-testid="variants-section">
      <div className="text-data-label mb-3">Variants (size × color)</div>
      {variants.length > 0 && (
        <div className="surface-card overflow-hidden mb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-data-label p-2">SKU</th>
                <th className="text-left text-data-label p-2">Color</th>
                <th className="text-left text-data-label p-2">Size</th>
                <th className="text-right text-data-label p-2">Price</th>
                <th className="text-right text-data-label p-2">Stock</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id} className="border-b border-border last:border-0" data-testid={`variant-row-${v.sku}`}>
                  <td className="font-mono p-2">{v.sku}</td>
                  <td className="p-2">{v.color || "—"}</td>
                  <td className="p-2">{v.size || "—"}</td>
                  <td className="text-right font-mono p-2">{v.price != null ? formatMoney(v.price, currency) : "(parent)"}</td>
                  <td className="text-right font-mono p-2">{v.quantity}</td>
                  <td className="text-right p-2">
                    <Button variant="ghost" size="icon" onClick={() => remove(v)} data-testid={`delete-variant-${v.sku}`}>
                      <Trash size={14} className="text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form onSubmit={add} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
        <Input placeholder="SKU" required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })} className="font-mono" data-testid="variant-sku-input" />
        <Input placeholder="Color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} data-testid="variant-color-input" />
        <Input placeholder="Size" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} data-testid="variant-size-input" />
        <Input placeholder="Price (opt)" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} data-testid="variant-price-input" />
        <Input placeholder="Qty" type="number" min="0" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} data-testid="variant-quantity-input" />
        <Button type="submit" disabled={busy} className="rounded-sm" data-testid="variant-add-button">{busy ? "…" : "Add"}</Button>
      </form>
    </div>
  );
}
