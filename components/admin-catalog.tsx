"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { booksHref, editBookHref } from "@/lib/admin-routes";
import { useAdminPreferences } from "./admin-preferences";
import { useEffect, useId, useRef, useState, type ComponentPropsWithoutRef, type FormEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, BookOpen, Calendar, CalendarClock, FileUp, ImagePlus, Save, Tag, type LucideIcon } from "lucide-react";
import { useAdmin, useAdminResource, AdminResourceState } from "./admin-context";
import { BookCover } from "./book-cover";
import { categories } from "@/lib/catalog";
import type { Product } from "@/lib/types";
import type { Asset } from "@/lib/commerce-types";
import { productSchema } from "@/lib/validation";
import styles from "./admin-book-editor.module.css";

type FieldProps = {
  label: string; name: string; value?: string | number; type?: string; required?: boolean;
  min?: number; max?: number; wide?: boolean; step?: string;
};

export function Field({ label, name, value, type = "text", required = false, min, max, wide = false, step }: FieldProps) {
  return <label className={wide ? "field-wide" : ""}>{label}{type === "textarea" ? <textarea name={name} defaultValue={value} required={required} rows={3} maxLength={max || 5000} minLength={min} /> : <input name={name} type={type} defaultValue={value} required={required} min={min} max={max} step={step} maxLength={type === "text" ? max || 200 : undefined} />}</label>;
}

type EditorFieldProps = FieldProps & {
  hint?: string; error?: string; currency?: boolean;
  inputProps?: Pick<ComponentPropsWithoutRef<"input">, "value" | "onChange" | "pattern" | "autoCapitalize" | "spellCheck" | "dir">;
};

function EditorField({ label, name, value, type = "text", required = false, min, max, wide = false, hint, error, currency, inputProps }: EditorFieldProps) {
  const { t } = useAdminPreferences();
  const id = useId();
  const description = [currency && `${id}-currency`, hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  const common = { id, name, required, defaultValue: value, "aria-describedby": description, "aria-invalid": error ? true : undefined };
  const control = type === "textarea"
      ? <textarea {...common} rows={name === "description" ? 4 : 3} maxLength={max ?? 5000} minLength={min} />
      : <input {...common} type={type} min={type === "number" ? min : undefined} max={type === "number" ? max : undefined}
          minLength={type === "text" ? min : undefined} maxLength={type === "text" ? max ?? 200 : undefined} {...inputProps} />;
  return <div className={wide ? "field-wide" : undefined}>
    <label htmlFor={id}>{label}{required && <span className={styles.required} aria-hidden="true"> *</span>}</label>
    {currency ? <div className={styles.currencyField}>
      <span className={styles.currencySymbol} aria-hidden="true">৳</span>
      <span id={`${id}-currency`} className="sr-only">{t("বাংলাদেশি টাকা")}</span>
      {control}
    </div> : control}
    {hint && <p id={`${id}-hint`} className={styles.hint}>{hint}</p>}
    {error && <p id={`${id}-error`} className={styles.fieldError}>{error}</p>}
  </div>;
}
const coverLabels = { sage: "সেজ সবুজ", sand: "বালুকাময়", emerald: "পান্না সবুজ", sky: "আকাশি", navy: "নেভি", clay: "মাটির রং" };
const newBookDraft: Product = { id: "new-book", slug: "", title: "", author: "", publisher: "", category: "life", price: 250, originalPrice: 300, stock: 0, pages: 160, language: "বাংলা", edition: "প্রথম সংস্করণ", binding: "হার্ডকভার", featured: false, coverTheme: "emerald", description: "", contents: [], sample: false, lowStockThreshold: 5 };
function EditorHeading({ editing, children }: { editing: boolean; children?: ReactNode }) {
  const { t } = useAdminPreferences();
  const title = t(editing ? "বইয়ের তথ্য সম্পাদনা" : "নতুন বই যোগ করুন");
  return <header className={styles.editorHeading}>
    <div>
      <div className={styles.breadcrumb}>
        <Link href={booksHref}>{t("বইয়ের তালিকা")}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{title}</span>
      </div>
      <h1>{title}</h1>
    </div>
    {children}
  </header>;
}

export function AdminNewBook() {
  const { t } = useAdminPreferences();
  const router = useRouter();
  const [saved, setSaved] = useState<Product | null>(null);
  return saved ? <Link href={editBookHref(saved.id)} className="button">{t("সংরক্ষিত বই সম্পাদনা করুন")}</Link> :
      <ProductEditor product={newBookDraft} assets={[]} exists={false} onAsset={() => {}} onSave={(product) => {
        setSaved(product);
        router.replace(editBookHref(product.id));
      }} />;
}

type EditBookResponse = { product: Product; assets: Asset[] };

export function AdminEditBook({ id }: { id: string }) {
  const { data, error, setData } = useAdminResource<EditBookResponse>(`/products/${encodeURIComponent(id)}`);
  return <>
    {!data && <EditorHeading editing />}
    <AdminResourceState error={error} loading={!data} />
    {data && <ProductEditor product={data.product} assets={data.assets} exists
      onAsset={(asset) => setData((current) => current && { ...current, assets: [...current.assets, asset] })}
      onSave={(product) => setData((current) => current && { ...current, product })} />}
  </>;
}

const editorSections: { id: string; label: string; tabLabel?: string; icon: LucideIcon }[] = [
  { id: "book-details", label: "বইয়ের মূল তথ্য", tabLabel: "মূল তথ্য", icon: BookOpen },
  { id: "book-pricing", label: "দাম ও স্টক", icon: Tag },
  { id: "book-publication", label: "প্রকাশনার তথ্য", tabLabel: "প্রকাশনা", icon: Calendar },
  { id: "book-media", label: "প্রচ্ছদ ও নমুনা", icon: ImagePlus },
  { id: "book-preorder", label: "প্রি-অর্ডার", icon: CalendarClock },
];

function EditorSection({ index, description, children }: { index: number; description?: string; children: ReactNode }) {
  const { t } = useAdminPreferences();
  const { id, label } = editorSections[index];
  return <section id={id} data-editor-section tabIndex={-1} aria-labelledby={`${id}-title`} className={`panel ${styles.section}`}>
    <div className={styles.sectionHeading}>
      <div><h2 id={`${id}-title`}>{t(label)}</h2>{description && <p>{t(description)}</p>}</div>
    </div>
    {children}
  </section>;
}

function slugFromTitle(title: string) {
  const normalized = title.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  if (/[^\x00-\x7f]/.test(normalized)) return "";
  return normalized.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100).replace(/-$/, "");
}

function ProductEditor({ product, assets, exists, onAsset, onSave }: { product: Product; assets: Asset[]; exists: boolean; onAsset: (a: Asset) => void; onSave: (p: Product) => void }) {
  const { t, bn } = useAdminPreferences();
  const { request, run, upload, busy } = useAdmin();
  const [draft, setDraft] = useState(product);
  const [preorder, setPreorder] = useState(!!product.preorder?.enabled);
  const [title, setTitle] = useState(product.title);
  const [customSlug, setCustomSlug] = useState<string | null>(exists ? product.slug : null);
  const slug = customSlug ?? slugFromTitle(title);
  const [coverPreview, setCoverPreview] = useState("");
  const coverSrc = draft.coverAssetId ? coverPreview || draft.demoAssetUrls?.[draft.coverAssetId] || assets.find((a) => a.id === draft.coverAssetId)?.url || `/api/media/${draft.coverAssetId}` : undefined;
  const [activeSection, setActiveSection] = useState(editorSections[0].id);
  const [validation, setValidation] = useState<{ name: string; message: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);
  useEffect(() => {
    if (!validation) return;
    const field = formRef.current?.elements.namedItem(validation.name);
    if (field instanceof HTMLElement) field.focus();
    else errorRef.current?.focus();
  }, [validation]);

  function field(props: EditorFieldProps) {
    return <EditorField {...props} label={t(props.label)} error={validation?.name === props.name ? t(validation.message) : undefined} />;
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const text = (name: string) => String(f.get(name) ?? "").trim();
    const number = (name: string) => Number(f.get(name));

    const candidate = {
      ...draft,
      title: text("title"), subtitle: text("subtitle"), author: text("author"), translator: text("translator"),
      editor: text("editor"), publisher: text("publisher"), isbn: text("isbn"),
      publicationYear: text("publicationYear") ? number("publicationYear") : undefined,
      slug: text("slug"), category: text("category"), price: number("price"),
      originalPrice: text("originalPrice") ? number("originalPrice") : number("price"),
      stock: number("stock"), lowStockThreshold: number("lowStockThreshold"), pages: number("pages"),
      language: text("language"), edition: text("edition"), binding: text("binding"), description: text("description"),
      contents: text("contents").split("\n").map((v) => v.trim()).filter(Boolean),
      tags: text("tags").split(",").map((v) => v.trim()).filter(Boolean),
      featured: f.get("featured") === "on", sample: f.get("sample") === "on", coverTheme: text("coverTheme"),
      previewPermission: f.get("previewPermission") === "on", previewPermissionNote: text("previewPermissionNote"),
      preorder: preorder ? {
        enabled: true, price: number("preorderPrice"), limit: number("preorderLimit"), reserved: draft.preorder?.reserved || 0,
        publicationDate: text("publicationDate"), dispatchDate: text("dispatchDate"), cancellationTerms: text("cancellationTerms"),
      } : draft.preorder ? { ...draft.preorder, enabled: false } : undefined,
    };

    const parsed = productSchema.safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const root = String(issue.path[0] ?? "originalPrice");
      const name = root === "preorder"
        ? ({ price: "preorderPrice", limit: "preorderLimit" }[String(issue.path[1])] ?? String(issue.path[1] ?? "dispatchDate"))
        : root;
      const messages: Record<string, string> = {
        title: "অন্তত ২ অক্ষর লিখুন।", author: "অন্তত ২ অক্ষর লিখুন।", publisher: "অন্তত ২ অক্ষর লিখুন।",
        language: "এই ঘরটি পূরণ করুন।", edition: "এই ঘরটি পূরণ করুন।", binding: "এই ঘরটি পূরণ করুন।",
        description: "অন্তত ১০ অক্ষর লিখুন।", cancellationTerms: "অন্তত ১০ অক্ষর লিখুন।",
        contents: "সর্বোচ্চ ৩০টি বিষয় লিখুন, প্রতিটি ১৫০ অক্ষরের মধ্যে।",
        tags: "সর্বোচ্চ ২০টি ট্যাগ দিন, প্রতিটি ৬০ অক্ষরের মধ্যে।",
      };
      setValidation({ name, message: messages[name] ?? issue.message });
      return;
    }
    setValidation(null);
    await run(async () => {
      const path = exists ? `/products/${encodeURIComponent(draft.id)}` : "/products";
      const r = await request<{ product: Product }>(path, { method: exists ? "PUT" : "POST", body: JSON.stringify(parsed.data) });
      if (exists) setDraft(r.product);
      onSave(r.product);
    }, t("বইয়ের তথ্য সংরক্ষিত হয়েছে"));
  }

  function fileInput(kind: "cover" | "gallery" | "preview", label: string) {
    return <label className="upload-control"><FileUp size={18} aria-hidden="true" /><span>{t(label)}</span>
      <input type="file" aria-label={t(label)}
        accept={kind === "preview" ? "application/pdf,image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp"}
        disabled={busy} onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          e.target.value = "";
          void run(async () => {
            const a = await upload(file, kind, draft.id);
            onAsset(a);
            if (kind === "cover") setCoverPreview(URL.createObjectURL(file));
            setDraft((p) => ({ ...p, ...(kind === "cover" ? { coverAssetId: a.id } : kind === "gallery"
              ? { galleryAssetIds: [...(p.galleryAssetIds || []), a.id] } : { previewAssetIds: [...(p.previewAssetIds || []), a.id] }) }));
          }, t("ফাইল আপলোড হয়েছে। বইটি সংরক্ষণ করে পরিবর্তন কার্যকর করুন।"));
        }} />
    </label>;
  }

  function movePreview(index: number, direction: number) {
    setDraft((current) => {
      const ids = [...(current.previewAssetIds ?? [])];
      const other = index + direction;
      if (other < 0 || other >= ids.length) return current;
      [ids[index], ids[other]] = [ids[other], ids[index]];
      return { ...current, previewAssetIds: ids };
    });
  }

  const saveButton = <button type="submit" className="button" disabled={busy}>
    <Save size={17} aria-hidden="true" />{busy ? t("অপেক্ষা করুন…") : t("বই সংরক্ষণ করুন")}
  </button>;

  return <form ref={formRef} className={styles.editor} method="post" onSubmit={submit} onFocusCapture={(event) => {
    const section = event.target.closest<HTMLElement>("[data-editor-section]");
    if (section) setActiveSection(section.id);
  }} onChange={(event) => {
    const target: EventTarget = event.target;
    if (validation && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
      if (target.name === validation.name
        || (validation.name === "originalPrice" && target.name === "price")
        || (validation.name === "dispatchDate" && target.name === "publicationDate")) setValidation(null);
    }
  }}>
    <EditorHeading editing={exists}>{saveButton}</EditorHeading>
    <nav className={styles.jumpLinks} aria-label={t("ফর্মের বিভাগ")}>
      {editorSections.map(({ id, label, tabLabel, icon: Icon }) => <a key={id} href={`#${id}`}
        aria-current={activeSection === id ? "location" : undefined}
        onClick={() => setActiveSection(id)}>
        <Icon size={18} aria-hidden="true" />{t(tabLabel ?? label)}
      </a>)}
    </nav>
    <EditorSection index={0} description="তারকা (*) দেওয়া ঘরগুলো পূরণ করা আবশ্যক।">
      <div className={styles.grid}>
        {field({ label: "বইয়ের নাম", name: "title", required: true, min: 2, max: 150, wide: true, inputProps: { value: title, onChange: (e) => setTitle(e.target.value) } })}
        {field({ label: "লেখক", name: "author", value: product.author, required: true, min: 2, max: 150 })}
        {field({ label: "প্রকাশনী", name: "publisher", value: product.publisher, required: true, min: 2, max: 150 })}
        <div><label htmlFor="book-category">{t("বিভাগ")}<span className={styles.required} aria-hidden="true"> *</span></label>
          <select id="book-category" name="category" defaultValue={product.category} required>
            {categories.filter((c) => c.id !== "all").map((c) => <option key={c.id} value={c.id}>{t(c.label)}</option>)}
          </select></div>
        {field({ label: "বইয়ের লিংকের নাম", name: "slug", required: true, max: 100,
          hint: t("ছোট ইংরেজি অক্ষর, সংখ্যা ও হাইফেন ব্যবহার করুন।"),
          inputProps: { value: slug, onChange: (e) => setCustomSlug(e.target.value), pattern: "[a-z0-9\\-]+", dir: "ltr", spellCheck: false, autoCapitalize: "none" } })}
        {(exists || slug) && <p className={`${styles.hint} ${styles.slugPreview}`}><bdi dir="ltr">/books/{slug || "…"}</bdi></p>}
        {field({ label: "বিবরণ", name: "description", type: "textarea", value: product.description, required: true, min: 10, wide: true })}
      </div>
    </EditorSection>
    <aside className={`panel ${styles.coverCard}`} data-new-book={!exists || undefined} aria-labelledby="book-cover-card-title">
      <h2 id="book-cover-card-title">{t(exists ? "বর্তমান প্রচ্ছদ" : "প্রচ্ছদ ও নমুনা")}</h2>
      {exists ? <>
        <div className={styles.coverArt}>
          {coverSrc ? <img src={coverSrc} alt={t("বর্তমান প্রচ্ছদ")} /> : <BookCover product={draft} />}
        </div>
        {!coverSrc && <p>{t("বিকল্প প্রচ্ছদ")}</p>}
        <a className={styles.manageCover} href="#book-media" onClick={() => setActiveSection("book-media")}>{t("প্রচ্ছদ পরিচালনা করুন")}</a>
      </> : <>
        <div className={styles.coverOutline} aria-hidden="true"><BookOpen size={52} strokeWidth={1.5} /></div>
        <p>{t("প্রথমবার সেভ করার পর প্রচ্ছদ যোগ করুন।")}</p>
      </>}
    </aside>
    <EditorSection index={1}>
      <div className={`${styles.grid} ${styles.pricingGrid}`}>
        {field({ label: "বিক্রয়মূল্য", name: "price", type: "number", value: exists ? product.price : undefined, min: 1, max: 100000, required: true, currency: true })}
        {field({ label: "মূল মূল্য", name: "originalPrice", type: "number", value: exists ? product.originalPrice : undefined, min: 1, max: 100000, currency: true, hint: t("ফাঁকা রাখলে বিক্রয়মূল্যই মূল মূল্য হবে।") })}
        {field({ label: "উপলব্ধ সাধারণ স্টক", name: "stock", type: "number", value: product.stock, min: 0, max: 100000, required: true })}
        {field({ label: "কম স্টকের সতর্কতার সীমা", name: "lowStockThreshold", type: "number", value: product.lowStockThreshold ?? 5, min: 0, max: 10000, required: true })}
      </div>
    </EditorSection>
    <EditorSection index={2} description="সংস্করণ, পৃষ্ঠা ও অন্যান্য বইয়ের তথ্য যোগ করুন।">
      <div className={styles.grid}>
        {field({ label: "পৃষ্ঠা", name: "pages", type: "number", value: exists ? product.pages : undefined, min: 1, max: 10000, required: true })}
        {field({ label: "ভাষা", name: "language", value: product.language, max: 50, required: true })}
        {field({ label: "সংস্করণ", name: "edition", value: product.edition, max: 100, required: true })}
        {field({ label: "বাঁধাই", name: "binding", value: product.binding, max: 50, required: true })}
        {field({ label: "উপশিরোনাম", name: "subtitle", value: product.subtitle, wide: true })}
        {field({ label: "অনুবাদক", name: "translator", value: product.translator, max: 150 })}
        {field({ label: "সম্পাদক", name: "editor", value: product.editor, max: 150 })}
        {field({ label: "ISBN (থাকলে)", name: "isbn", value: product.isbn, max: 20 })}
        {field({ label: "প্রকাশের বছর", name: "publicationYear", type: "number", value: product.publicationYear, min: 600, max: 2200 })}
        {field({ label: "বিষয় ট্যাগ (কমা দিয়ে আলাদা)", name: "tags", value: product.tags?.join(", "), max: 1220, wide: true })}
        {field({ label: "সূচিপত্র (প্রতি লাইনে একটি বিষয়)", name: "contents", type: "textarea", value: product.contents.join("\n"), wide: true })}
        <label className="checkbox-label"><input name="featured" type="checkbox" defaultChecked={product.featured} />{t("নির্বাচিত বইয়ে দেখান")}</label>
        <label className="checkbox-label"><input name="sample" type="checkbox" defaultChecked={product.sample !== false} />{t("এটি নমুনা পণ্য")}</label>
      </div>
    </EditorSection>
    <EditorSection index={3} description={exists ? "প্রচ্ছদ, অতিরিক্ত ছবি ও পড়ার নমুনা যোগ করুন।" : "প্রথমবার সেভ করার পর এই বিভাগ থেকে ছবি ও নমুনা যোগ করতে পারবেন।"}>
      <div className={styles.grid}><div><label htmlFor="book-cover-theme">{t("বিকল্প প্রচ্ছদ")}</label>
        <select id="book-cover-theme" name="coverTheme" defaultValue={product.coverTheme}>
          {Object.entries(coverLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
        </select>
      </div></div>
      {exists && <div className={styles.mediaGroups}>
        <div>
          <h3>{t("প্রচ্ছদ ও অতিরিক্ত ছবি")}</h3>
          <div className="upload-controls">{fileInput("cover", "প্রচ্ছদ আপলোড")}{fileInput("gallery", "অতিরিক্ত ছবি")}</div>
          {(draft.coverAssetId || draft.galleryAssetIds?.length) ? <div className="asset-grid">
            {draft.coverAssetId && <div className="asset-card">
              <img src={coverSrc} alt="" />
              <span>{t("প্রচ্ছদ ·")} {draft.coverAssetId.slice(-8)}</span>
              <button type="button" className="text-link" onClick={() => { setCoverPreview(""); setDraft((p) => ({ ...p, coverAssetId: undefined })); }}>{t("বিচ্ছিন্ন করুন")}</button>
            </div>}
            {draft.galleryAssetIds?.map((assetId) => <div className="asset-card" key={assetId}><span>{t("ছবি ·")} {assetId.slice(-8)}</span>
              <button type="button" className="text-link" onClick={() => setDraft((p) => ({ ...p, galleryAssetIds: p.galleryAssetIds?.filter((a) => a !== assetId) }))}>{t("সরান")}</button></div>)}
          </div> : null}
        </div>
        <div>
          <h3>{t("নমুনা পড়ার ব্যবস্থা")}</h3>
          <p className={styles.hint}>{t("একটি PDF (সর্বোচ্চ ৩০ পৃষ্ঠা) অথবা পৃষ্ঠার ছবিগুলো দিন। নমুনা সম্পূর্ণ বইয়ের চেয়ে ছোট হতে হবে। প্রতি ফাইল সর্বোচ্চ ১০ মেগাবাইট।")}</p>
          {fileInput("preview", "নমুনা PDF / পৃষ্ঠা")}
          {!!draft.previewAssetIds?.length && <div className="preview-file-list">
            {draft.previewAssetIds.map((assetId, i, list) => {
              const asset = assets.find((a) => a.id === assetId);
              return <div key={assetId}><span>{bn(i + 1)}. {asset?.mime === "application/pdf" ? "PDF" : t("নমুনা পৃষ্ঠা")} · {bn(asset?.pages || 1)} {t("পৃষ্ঠা")}</span>
                <button type="button" aria-label={t("পৃষ্ঠা উপরে নিন")} disabled={i === 0} onClick={() => movePreview(i, -1)}><ArrowUp size={16} aria-hidden="true" /></button>
                <button type="button" aria-label={t("পৃষ্ঠা নিচে নিন")} disabled={i === list.length - 1} onClick={() => movePreview(i, 1)}><ArrowDown size={16} aria-hidden="true" /></button>
                <button type="button" className="text-link" onClick={() => setDraft((p) => ({ ...p, previewAssetIds: p.previewAssetIds?.filter((a) => a !== assetId) }))}>{t("সরান")}</button>
              </div>;
            })}
          </div>}
          <label className="checkbox-label"><input name="previewPermission" type="checkbox" defaultChecked={product.previewPermission} />{t("নমুনা প্রকাশের জন্য প্রকাশক / স্বত্বাধিকারীর অনুমতি আছে")}</label>
          {field({ label: "অনুমতির বিবরণ / রেফারেন্স", name: "previewPermissionNote", value: product.previewPermissionNote, max: 500 })}
        </div>
      </div>}
    </EditorSection>
    <EditorSection index={4} description="প্রকাশের আগে অর্ডার নিতে চাইলে চালু করুন।">
      <label className="checkbox-label"><input type="checkbox" checked={preorder} onChange={(e) => setPreorder(e.target.checked)} />{t("এই বইয়ের প্রি-অর্ডার চালু করুন")}</label>
      <div hidden={!preorder}>
        <fieldset className={styles.preorderFields} disabled={!preorder} aria-label={t("প্রি-অর্ডার")}>
          <div className={styles.grid}>
            {field({ label: "প্রি-অর্ডার মূল্য", name: "preorderPrice", type: "number", value: product.preorder?.price ?? (exists ? product.price : undefined), min: 1, max: 100000, required: true, currency: true })}
            {field({ label: "মোট প্রি-অর্ডার সীমা", name: "preorderLimit", type: "number", value: product.preorder?.limit || 100, min: 1, max: 100000, required: true })}
            {field({ label: "সম্ভাব্য প্রকাশের তারিখ", name: "publicationDate", type: "date", value: product.preorder?.publicationDate, required: true })}
            {field({ label: "সম্ভাব্য পাঠানোর তারিখ", name: "dispatchDate", type: "date", value: product.preorder?.dispatchDate, required: true })}
            {field({ label: "বাতিলের শর্ত", name: "cancellationTerms", type: "textarea", value: product.preorder?.cancellationTerms, required: true, min: 10, max: 1000, wide: true })}
          </div>
        </fieldset>
        <p className={styles.hint}>{t("সংরক্ষিত প্রি-অর্ডার:")} {bn(product.preorder?.reserved || 0)} {t("কপি। সাধারণ স্টক থেকে আলাদা হিসাব। সব বই প্রস্তুত হলে একসঙ্গে ডেলিভারি হবে।")}</p>
      </div>
    </EditorSection>
    <div className={`panel ${styles.actions}`}>
      {validation && <p ref={errorRef} className={`form-error ${styles.summaryError}`} tabIndex={-1} role="alert">{t(validation.message)}</p>}
      <p className={styles.saveHint}>{t(exists ? "সেভ করলে বইয়ের তথ্য আপডেট হবে।" : "সেভ করলে বইটি দোকানের তালিকায় যোগ হবে।")}</p>
      {saveButton}
    </div>
  </form>;
}
