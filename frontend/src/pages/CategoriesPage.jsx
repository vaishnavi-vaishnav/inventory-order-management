import { useEffect, useState } from "react";
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
import { Plus, PencilSimple, Trash, Tag } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function CategoriesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/categories");
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

  const openCreate = () => {
    setEditing(null);
    setName("");
    setOpen(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setName(c.name);
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      if (editing) {
        await api.put(`/categories/${editing.id}`, { name: trimmed });
        toast.success("Category updated");
      } else {
        await api.post("/categories", { name: trimmed });
        toast.success("Category created");
      }
      setOpen(false);
      setName("");
      setEditing(null);
      refresh();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete category "${c.name}"?`)) return;
    try {
      await api.delete(`/categories/${c.id}`);
      toast.success("Category deleted");
      refresh();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  return (
    <div>
      <PageHeader
        section="Catalog"
        title="Categories"
        description="Organize products into categories. Assign categories when creating or editing products."
        actions={
          <Button onClick={openCreate} data-testid="add-category-button" className="rounded-sm hover:-translate-y-[1px] transition-transform">
            <Plus size={16} className="mr-2" />New Category
          </Button>
        }
      />

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No categories yet"
          description="Create categories to group products in your catalog."
          action={
            <Button onClick={openCreate} data-testid="empty-add-category-button" className="rounded-sm">
              Add Category
            </Button>
          }
        />
      ) : (
        <div className="surface-card overflow-hidden" data-testid="categories-table-wrapper">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-data-label">Name</TableHead>
                <TableHead className="text-data-label">Created</TableHead>
                <TableHead className="text-data-label text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} data-testid={`category-row-${c.name}`}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(c)}
                      data-testid={`edit-category-${c.name}`}
                    >
                      <PencilSimple size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(c)}
                      data-testid={`delete-category-${c.name}`}
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

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
        <DialogContent className="rounded-sm sm:max-w-md" data-testid="category-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">{editing ? "Edit Category" : "New Category"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-data-label">Name *</Label>
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Computer Accessories"
                data-testid="category-name-input"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy} data-testid="category-submit-button">
                {busy ? "Saving…" : editing ? "Update Category" : "Create Category"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
