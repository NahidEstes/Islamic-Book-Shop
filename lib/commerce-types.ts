import type { Customer, Order, Product } from "./types";

export const roles = ["customer", "owner", "manager", "catalog", "orders"] as const;
export type Role = typeof roles[number];
export type Permission = "catalog" | "collections" | "orders" | "reviews" | "returns" | "finance" | "reports" | "staff" | "audit" | "notifications";
export const rolePermissions: Record<Role, Permission[]> = {
  customer: [], owner: ["catalog", "collections", "orders", "reviews", "returns", "finance", "reports", "staff", "audit", "notifications"],
  manager: ["catalog", "collections", "orders", "reviews", "returns", "finance", "reports", "audit", "notifications"],
  catalog: ["catalog", "collections"], orders: ["orders", "returns"],
};
export const roleLabels: Record<Role, string> = { customer: "পাঠক", owner: "মালিক", manager: "ম্যানেজার", catalog: "ক্যাটালগ সম্পাদক", orders: "অর্ডার অপারেটর" };
export type SavedAddress = Customer & { id: string; label: string };
export type User = { id: string; name: string; email: string; emailVerified: boolean; passwordHash: string; role: Role; disabled: boolean; addresses: SavedAddress[]; createdAt: string };
export type PublicUser = Omit<User, "passwordHash">;
export type Session = { id: string; userId: string; expiresAt: string };
export type IdentityToken = { id: string; userId: string; purpose: "reset" | "verify"; expiresAt: string };
export type Review = { id: string; productId: string; userId: string; displayName: string; rating: number; text: string; status: "pending" | "approved" | "rejected" | "hidden"; verified: boolean; createdAt: string; updatedAt: string; moderationNote?: string };
export type Collection = { id: string; slug: string; title: string; description: string; reason: string; imageAssetId?: string; productIds: string[]; published: boolean; featured: boolean; sortOrder: number };
export type Asset = { id: string; filename: string; kind: "cover" | "gallery" | "preview" | "collection"; mime: string; size: number; pages: number; productId?: string; createdAt: string };
export type Subscription = { id: string; userId: string; productId: string; active: boolean; lastVersion: number };
export type Notification = { id: string; userId: string; message: string; href: string; read: boolean; createdAt: string };
export type OutboxMessage = { id: string; userId: string; to: string; subject: string; text: string; type: "restock" | "preorder" | "reset" | "verify"; status: "pending" | "unavailable" | "sending" | "sent" | "failed"; attempts: number; nextAttemptAt: string; leaseUntil?: string; createdAt: string; expiresAt?: string };
export type ReturnRequest = { id: string; orderId: string; userId: string; reason: string; items: { productId: string; quantity: number }[]; status: "requested" | "approved" | "rejected" | "received" | "withdrawn"; restocked: boolean; note: string; createdAt: string };
export type Payment = { id: string; orderId: string; amount: number; reference: string; method: "cod" | "bank"; recordedBy: string; createdAt: string };
export type Refund = { id: string; returnId: string; orderId: string; amount: number; method: "cash" | "bank"; reference: string; status: "pending" | "completed" | "cancelled"; recordedBy: string; createdAt: string; completedAt?: string };
export type Audit = { id: string; actor: string; action: string; target: string; at: string };
export type ShopData = { products: Product[]; orders: Order[]; users: User[]; sessions: Session[]; tokens: IdentityToken[]; reviews: Review[]; collections: Collection[]; assets: Asset[]; subscriptions: Subscription[]; notifications: Notification[]; outbox: OutboxMessage[]; returns: ReturnRequest[]; payments: Payment[]; refunds: Refund[]; audit: Audit[] };
export type AccountData = { user: PublicUser; orders: Order[]; notifications: Notification[]; subscriptions: Subscription[]; returns: ReturnRequest[]; reviews: Review[]; refunds: Pick<Refund, "id" | "returnId" | "amount" | "status" | "completedAt">[] };
export type Dashboard = { orderCount: number; demoCount: number; cancelledCount: number; orderedTotal: number; deliveredSales: number; collected: number; refunded: number; netCollected: number; outstanding: number; lowStock: Product[] };
