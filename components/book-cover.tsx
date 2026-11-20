import type { Product } from "@/lib/types";
export function BookCover({ product, small = false, assetId }: { product: Product; small?: boolean; assetId?: string }) {
  const imageId = assetId || product.coverAssetId;
  if (imageId) return <div className={`cover-stage uploaded-stage ${small ? "cover-small" : ""}`}><img className="uploaded-cover" src={product.demoAssetUrls?.[imageId] || `/api/media/${imageId}`} alt={`${product.title} বইয়ের প্রচ্ছদ`} loading="lazy" /></div>;
  return <div className={`cover-stage theme-${product.coverTheme} ${small ? "cover-small" : ""}`}>
    <div className={`book-cover cover-${product.coverTheme}`} role="img" aria-label={`${product.title} বইয়ের নমুনা প্রচ্ছদ`}>
      <div className="cover-frame" /><div className="cover-rosette">✧</div>
      <div className="cover-type"><strong>{product.title}</strong><span>{product.author}</span></div>
      <span className="cover-publisher">নূর প্রকাশন</span>
    </div>
  </div>;
}
