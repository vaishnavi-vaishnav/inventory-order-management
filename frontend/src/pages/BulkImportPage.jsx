import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { PageHeader } from "@/components/Common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
  DownloadSimple,
  UploadSimple,
  CheckCircle,
  XCircle,
  WarningCircle,
  CircleNotch,
  FileArrowUp,
  FileCsv,
  FileXls,
  ArrowRight,
  ListChecks,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const PHASE = {
  IDLE: "idle",
  PREVIEWING: "previewing",
  IMPORTING: "importing",
  COMPLETE: "complete",
  ERROR: "error",
};

const STEPS = [
  { n: 1, title: "Get template", desc: "Download CSV or Excel format" },
  { n: 2, title: "Upload file", desc: "Select your filled spreadsheet" },
  { n: 3, title: "Import", desc: "Review row count and start import" },
];

const REQUIRED_COLS = ["name", "sku", "price", "quantity"];

export default function BulkImportPage() {
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const progressTimer = useRef(null);
  const fileInputRef = useRef(null);

  const currentStep = preview ? 3 : file ? 2 : 1;

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const { data } = await api.get("/products/import/logs");
      setLogs(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, [loadLogs]);

  const stopProgressTimer = () => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  };

  const startProcessingAnimation = (total) => {
    stopProgressTimer();
    setProgress(35);
    setStatusText(`Processing products… 0 of ${total}`);
    let tick = 0;
    progressTimer.current = setInterval(() => {
      tick += 1;
      const simulated = Math.min(90, 35 + tick * 2);
      setProgress(simulated);
      const processed = Math.min(total, Math.round((simulated / 100) * total));
      setStatusText(`Processing products… ${processed} of ${total}`);
    }, 200);
  };

  const downloadTemplate = async (format) => {
    try {
      const { data } = await api.get(`/products/import/template?format=${format}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `products_import_template.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} template downloaded`);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const reset = () => {
    stopProgressTimer();
    setPhase(PHASE.IDLE);
    setFile(null);
    setPreview(null);
    setResult(null);
    setProgress(0);
    setStatusText("");
    setSelectedLog(null);
  };

  const handleFileSelect = async (selected) => {
    if (!selected) return;
    const ext = selected.name.toLowerCase();
    if (!ext.endsWith(".csv") && !ext.endsWith(".xlsx")) {
      toast.error("Please upload a .csv or .xlsx file");
      return;
    }

    setFile(selected);
    setResult(null);
    setSelectedLog(null);
    setPhase(PHASE.PREVIEWING);
    setProgress(5);
    setStatusText("Reading file…");

    const fd = new FormData();
    fd.append("file", selected);
    try {
      const { data } = await api.post("/products/import/preview", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 25));
        },
      });
      setPreview(data);
      setProgress(30);
      setStatusText(`Found ${data.total_rows} product${data.total_rows === 1 ? "" : "s"}`);
      setPhase(PHASE.IDLE);
    } catch (err) {
      setPhase(PHASE.ERROR);
      setStatusText(formatApiError(err.response?.data?.detail));
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFileSelect(dropped);
  };

  const runImport = async () => {
    if (!file || !preview) return;

    setPhase(PHASE.IMPORTING);
    setProgress(10);
    setStatusText(`Uploading ${file.name}…`);

    const fd = new FormData();
    fd.append("file", file);
    startProcessingAnimation(preview.total_rows);

    try {
      const { data } = await api.post("/products/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.min(34, Math.round((e.loaded / e.total) * 30) + 5));
        },
      });
      stopProgressTimer();
      setProgress(100);
      setStatusText(`Complete — ${data.created} of ${data.total_rows} imported`);
      setResult(data);
      setPhase(PHASE.COMPLETE);
      setSelectedLog(null);
      await loadLogs();
      if (data.failed === 0) {
        toast.success(`Successfully imported all ${data.created} products`);
      } else {
        toast.warning(`Imported ${data.created} of ${data.total_rows}. ${data.failed} failed.`);
      }
    } catch (err) {
      stopProgressTimer();
      setPhase(PHASE.ERROR);
      setStatusText(formatApiError(err.response?.data?.detail));
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const viewLog = async (log) => {
    try {
      const { data } = await api.get(`/products/import/logs/${log.id}`);
      setSelectedLog(data);
      setResult(null);
      setPhase(PHASE.COMPLETE);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const displayLog = selectedLog?.filename
    ? selectedLog
    : result
      ? {
          total_rows: result.total_rows,
          created_count: result.created,
          failed_count: result.failed,
          errors: result.errors,
        }
      : null;
  const showResultPanel = phase === PHASE.COMPLETE && displayLog;
  const busy = phase === PHASE.IMPORTING || phase === PHASE.PREVIEWING;

  return (
    <div>
      <PageHeader
        section="Catalog"
        title="Bulk Import"
        description="Import dozens of products at once from a spreadsheet. Download a template, fill it in, and upload."
        actions={
          <Button variant="outline" className="rounded-sm" asChild>
            <Link to="/products">
              View catalog <ArrowRight size={16} className="ml-2" />
            </Link>
          </Button>
        }
      />

      {/* Step indicator */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8" data-testid="import-steps">
        {STEPS.map((step) => (
          <div
            key={step.n}
            className={`surface-card rounded-sm p-4 border transition-colors ${
              currentStep === step.n
                ? "border-primary bg-primary/5"
                : currentStep > step.n
                  ? "border-emerald-200 bg-emerald-50/50"
                  : "border-border"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`h-8 w-8 rounded-sm grid place-items-center text-sm font-bold font-mono shrink-0 ${
                  currentStep > step.n
                    ? "bg-emerald-600 text-white"
                    : currentStep === step.n
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {currentStep > step.n ? <CheckCircle size={18} weight="bold" /> : step.n}
              </div>
              <div>
                <div className="text-sm font-semibold">{step.title}</div>
                <div className="text-xs text-muted-foreground">{step.desc}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main upload column */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="surface-card rounded-sm overflow-hidden" data-testid="bulk-import-panel">
            <div className="px-5 py-4 border-b border-border bg-muted/20">
              <h2 className="font-heading text-lg font-bold tracking-tight">Upload spreadsheet</h2>
              <p className="text-xs text-muted-foreground mt-0.5">CSV or Excel (.xlsx) — max one file at a time</p>
            </div>

            <div className="p-5 space-y-5">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" className="rounded-sm" onClick={() => downloadTemplate("csv")} data-testid="bulk-csv-template">
                  <FileCsv size={16} className="mr-2" />CSV Template
                </Button>
                <Button type="button" variant="outline" size="sm" className="rounded-sm" onClick={() => downloadTemplate("xlsx")} data-testid="bulk-xlsx-template">
                  <FileXls size={16} className="mr-2" />Excel Template
                </Button>
              </div>

              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && !busy && fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => !busy && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-sm p-10 text-center cursor-pointer transition-all ${
                  dragOver
                    ? "border-primary bg-primary/10 scale-[1.01]"
                    : phase === PHASE.IMPORTING
                      ? "border-primary/50 bg-primary/5 cursor-wait"
                      : "border-border hover:border-primary/40 hover:bg-muted/30"
                }`}
                data-testid="bulk-import-dropzone"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="hidden"
                  data-testid="bulk-import-input"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                    e.target.value = "";
                  }}
                />
                <FileArrowUp size={40} className={`mx-auto mb-3 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
                <p className="text-sm font-medium">
                  {dragOver ? "Drop file here" : "Drag & drop or click to browse"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">.csv or .xlsx</p>
              </div>

              {preview && phase !== PHASE.PREVIEWING && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-sm border border-border bg-background">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-sm bg-muted grid place-items-center shrink-0">
                      {preview.file_type === "xlsx" ? <FileXls size={22} /> : <FileCsv size={22} />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-medium truncate">{preview.filename}</div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{preview.total_rows}</span> products ready to import
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button type="button" variant="outline" size="sm" className="rounded-sm" onClick={(e) => { e.stopPropagation(); reset(); }} disabled={phase === PHASE.IMPORTING}>
                      Clear
                    </Button>
                    <Button type="button" size="sm" className="rounded-sm" onClick={(e) => { e.stopPropagation(); runImport(); }} disabled={phase === PHASE.IMPORTING} data-testid="bulk-import-start">
                      {phase === PHASE.IMPORTING ? (
                        <><CircleNotch size={16} className="mr-2 animate-spin" />Importing…</>
                      ) : (
                        <><UploadSimple size={16} className="mr-2" />Import {preview.total_rows} products</>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {(phase === PHASE.PREVIEWING || phase === PHASE.IMPORTING || phase === PHASE.ERROR) && (
                <div className="space-y-3 p-4 rounded-sm bg-muted/30" data-testid="bulk-import-progress">
                  <div className="flex items-center justify-between text-sm gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                      {(phase === PHASE.PREVIEWING || phase === PHASE.IMPORTING) && (
                        <CircleNotch size={16} className="animate-spin text-primary shrink-0" />
                      )}
                      {phase === PHASE.ERROR && <XCircle size={16} className="text-destructive shrink-0" />}
                      <span className={phase === PHASE.ERROR ? "text-destructive" : ""}>{statusText}</span>
                    </div>
                    {phase === PHASE.IMPORTING && preview && (
                      <span className="font-mono text-xs text-muted-foreground shrink-0">
                        {Math.round(progress)}%
                      </span>
                    )}
                  </div>
                  <Progress value={progress} className="h-2.5" />
                  {phase === PHASE.IMPORTING && preview && (
                    <p className="text-xs text-muted-foreground">
                      Importing <span className="font-mono font-medium">{preview.total_rows}</span> products — please keep this page open.
                    </p>
                  )}
                </div>
              )}

              {showResultPanel && (
                <div className="space-y-4 pt-2 border-t border-border" data-testid="bulk-import-result">
                  <div className="grid grid-cols-3 gap-3">
                    <ResultStat label="Total" value={displayLog.total_rows} icon={FileArrowUp} />
                    <ResultStat label="Imported" value={displayLog.created_count} icon={CheckCircle} accent="text-emerald-600" />
                    <ResultStat
                      label="Failed"
                      value={displayLog.failed_count}
                      icon={displayLog.failed_count > 0 ? WarningCircle : CheckCircle}
                      accent={displayLog.failed_count > 0 ? "text-amber-600" : "text-emerald-600"}
                    />
                  </div>

                  {(displayLog.errors?.length ?? 0) > 0 ? (
                    <div className="overflow-hidden border border-border rounded-sm">
                      <div className="px-4 py-2.5 border-b border-border bg-amber-50 text-amber-900 text-xs font-medium">
                        {displayLog.failed_count} row{displayLog.failed_count === 1 ? "" : "s"} could not be imported
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-data-label w-14">Row</TableHead>
                              <TableHead className="text-data-label w-28">SKU</TableHead>
                              <TableHead className="text-data-label">Reason</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {displayLog.errors.map((err, i) => (
                              <TableRow key={`${err.row}-${i}`} data-testid={`import-error-row-${err.row}`}>
                                <TableCell className="font-mono text-xs">{err.row}</TableCell>
                                <TableCell className="font-mono text-xs">{err.sku || "—"}</TableCell>
                                <TableCell className="text-xs text-destructive">{err.error}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-sm px-4 py-3">
                      <CheckCircle size={20} weight="bold" className="text-emerald-600" />
                      All products imported successfully.
                    </div>
                  )}

                  {result && (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" className="rounded-sm" onClick={reset}>
                        Import another file
                      </Button>
                      <Button type="button" size="sm" className="rounded-sm" asChild>
                        <Link to="/products">View products</Link>
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar help */}
        <div className="space-y-4">
          <Card className="surface-card rounded-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <ListChecks size={20} className="text-primary" />
              <h3 className="font-heading font-bold text-sm">Required columns</h3>
            </div>
            <ul className="space-y-2">
              {REQUIRED_COLS.map((col) => (
                <li key={col} className="flex items-center gap-2 text-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{col}</code>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
              Optional: category, brand, currency, barcode, description, image_url, and more. See the template for all fields.
            </p>
          </Card>

          <Card className="surface-card rounded-sm p-5">
            <h3 className="font-heading font-bold text-sm mb-2">Tips</h3>
            <ul className="text-xs text-muted-foreground space-y-2 leading-relaxed list-disc pl-4">
              <li>SKUs must be unique across your catalog.</li>
              <li>Categories in the file are created automatically if missing.</li>
              <li>Duplicate SKUs in the file will be skipped with an error log.</li>
              <li>Use the Excel template for easier editing in Google Sheets or Excel.</li>
            </ul>
          </Card>
        </div>
      </div>

      {/* Import history */}
      <Card className="surface-card rounded-sm overflow-hidden mt-8" data-testid="import-logs-card">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-heading text-lg font-bold tracking-tight">Import History</h2>
            <p className="text-xs text-muted-foreground mt-0.5">All past bulk imports — click a row to view details</p>
          </div>
          <Button variant="ghost" size="sm" className="rounded-sm text-xs" onClick={loadLogs} disabled={logsLoading}>
            Refresh
          </Button>
        </div>
        {logsLoading ? (
          <div className="px-5 py-10 text-sm text-muted-foreground text-center">Loading history…</div>
        ) : logs.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <FileArrowUp size={32} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No imports yet. Upload your first spreadsheet above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-data-label">When</TableHead>
                  <TableHead className="text-data-label">File</TableHead>
                  <TableHead className="text-data-label text-right">Total</TableHead>
                  <TableHead className="text-data-label text-right">OK</TableHead>
                  <TableHead className="text-data-label text-right">Failed</TableHead>
                  <TableHead className="text-data-label">Result</TableHead>
                  <TableHead className="text-data-label text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow
                    key={log.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => viewLog(log)}
                    data-testid={`import-log-${log.id}`}
                  >
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs">{log.filename}</div>
                      <div className="text-[10px] uppercase text-muted-foreground">{log.file_type}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{log.total_rows}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-emerald-700">{log.created_count}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-amber-600">{log.failed_count}</TableCell>
                    <TableCell>
                      <ImportStatusBadge created={log.created_count} failed={log.failed_count} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="text-xs rounded-sm" onClick={(e) => { e.stopPropagation(); viewLog(log); }}>
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ImportStatusBadge({ created, failed }) {
  if (failed === 0) {
    return <Badge className="rounded-none text-[10px] uppercase">Success</Badge>;
  }
  if (created === 0) {
    return <Badge variant="destructive" className="rounded-none text-[10px] uppercase">Failed</Badge>;
  }
  return <Badge variant="secondary" className="rounded-none text-[10px] uppercase">Partial</Badge>;
}

function ResultStat({ label, value, icon: Icon, accent = "text-foreground" }) {
  return (
    <div className="border border-border rounded-sm p-3 text-center bg-muted/20">
      <Icon size={20} className={`mx-auto mb-1 ${accent}`} />
      <div className={`font-heading text-xl font-bold font-mono ${accent}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
