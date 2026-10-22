"use client";
import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, LoaderCircle, Minus, Plus, X } from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { api } from "@/lib/api";
import { bn } from "@/lib/catalog";
type PreviewAsset = { id: string; mime: string; pages: number; url: string };
export function BookPreview({ productId, title, available }: { productId: string; title: string; available: boolean }) {
  const [open, setOpen] = useState(false); const [assets, setAssets] = useState<PreviewAsset[]>([]); const [error, setError] = useState("");
  const [loading, setLoading] = useState(false); const [page, setPage] = useState(1); const [zoom, setZoom] = useState(1); const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const dialog = useRef<HTMLDialogElement>(null); const canvas = useRef<HTMLCanvasElement>(null); const surface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return; const element = dialog.current; element?.showModal(); const oldOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    let alive = true; let doc: PDFDocumentProxy | null = null; let destroy: (() => Promise<void>) | undefined;
    setPage(1); setZoom(1); setError(""); setLoading(true); setAssets([]); setPdf(null);
    void (async () => {
      try {
        const data = await api<{ assets: PreviewAsset[] }>(`/books/${productId}/preview`); if (!alive) return; setAssets(data.assets);
        if (data.assets[0]?.mime === "application/pdf") { const lib = await import("pdfjs-dist"); lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"; const task = lib.getDocument({ url: data.assets[0].url, enableXfa: false, cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/", wasmUrl: "/pdfjs/wasm/", iccUrl: "/pdfjs/iccs/" }); destroy = () => task.destroy(); doc = await task.promise; if (alive) setPdf(doc); }
      } catch { if (alive) setError("নমুনাটি খোলা যাচ্ছে না। পরে আবার চেষ্টা করুন।"); } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; document.body.style.overflow = oldOverflow; element?.close(); if (destroy) void destroy(); };
  }, [open, productId]);
  useEffect(() => {
    if (!open || !pdf || !canvas.current) return; let render: RenderTask | undefined; let active = true; setLoading(true);
    void (async () => { try { const p = await pdf.getPage(page); if (!active || !canvas.current) return; const natural = p.getViewport({ scale: 1 }); const width = Math.max(240, Math.min(900, (surface.current?.clientWidth || 700) - 32)); const view = p.getViewport({ scale: width / natural.width * zoom }); const el = canvas.current; const outputScale = Math.min(window.devicePixelRatio || 1, 2); el.width = Math.ceil(view.width * outputScale); el.height = Math.ceil(view.height * outputScale); el.style.width = `${view.width}px`; el.style.height = `${view.height}px`; render = p.render({ canvas: el, viewport: view, transform: [outputScale, 0, 0, outputScale, 0, 0] }); await render.promise; } catch (e) { if (active && (e as Error).name !== "RenderingCancelledException") setError("এই পৃষ্ঠাটি দেখানো যাচ্ছে না"); } finally { if (active) setLoading(false); } })();
    return () => { active = false; render?.cancel(); };
  }, [pdf, page, zoom, open]);
  const pages = pdf?.numPages || assets.length;
  return <><button type="button" className="button button-outline preview-trigger" aria-expanded={open} aria-controls={`book-reader-${productId}`} disabled={!available} onClick={() => setOpen(true)}><BookOpen size={17} />{available ? "একটু পড়ে দেখুন" : "নমুনা পৃষ্ঠা এখনও নেই"}</button><dialog id={`book-reader-${productId}`} ref={dialog} className="reader-dialog" aria-labelledby="reader-title" onCancel={() => { setOpen(false); setPdf(null); }} onClose={() => { setOpen(false); setPdf(null); }}><header><div><span className="eyebrow">অনুমতিপ্রাপ্ত নমুনা পৃষ্ঠা</span><h2 id="reader-title">{title}</h2></div><button autoFocus aria-label="প্রিভিউ বন্ধ করুন" onClick={() => { dialog.current?.close(); setOpen(false); setPdf(null); }}><X /></button></header><div className="reader-toolbar"><button aria-label="আগের পৃষ্ঠা" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}><ChevronLeft /></button><span aria-live="polite">পৃষ্ঠা {bn(page)} / {bn(pages)}</span><button aria-label="পরের পৃষ্ঠা" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}><ChevronRight /></button><i /><button aria-label="জুম কমান" disabled={zoom <= .6} onClick={() => setZoom(Math.max(.6, zoom - .2))}><Minus size={18} /></button><span>{Math.round(zoom * 100)}%</span><button aria-label="জুম বাড়ান" disabled={zoom >= 2} onClick={() => setZoom(Math.min(2, zoom + .2))}><Plus size={18} /></button></div><div className="reader-surface" ref={surface}>{loading && <div className="reader-loading" role="status"><LoaderCircle className="spin" /> লোড হচ্ছে...</div>}{error && <p role="alert" className="form-error">{error}</p>}{pdf ? <canvas ref={canvas} role="img" aria-label={`${title}, নমুনা পৃষ্ঠা ${bn(page)}`} /> : assets[page - 1]?.mime.startsWith("image/") ? <img src={assets[page - 1].url} alt={`${title}, নমুনা পৃষ্ঠা ${bn(page)}`} style={{ width: `${zoom * 100}%`, maxWidth: "none" }} /> : !loading && !error && <p>এই বইয়ের নমুনা প্রকাশ করা হয়নি।</p>}</div><footer>নমুনা পাঠ · সূচিপত্র বইয়ের বিস্তারিত অংশে পাওয়া যাবে</footer></dialog></>;
}
