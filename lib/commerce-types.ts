import type { Customer, Order, Product } from "./types";

export const roles = ["customer", "owner", "manager", "catalog", "orders"] as const;
export type Role = typeof roles[number];
export type Permission = "catalog" | "inventory" | "collections" | "orders" | "reviews" | "returns" | "finance" | "reports" | "staff" | "audit" | "notifications" | "promotions";
export const rolePermissions: Record<Role, Permission[]> = {
  customer: [], owner: ["catalog", "inventory", "collections", "orders", "reviews", "returns", "finance", "reports", "staff", "audit", "notifications", "promotions"],
  manager: ["catalog", "inventory", "collections", "orders", "reviews", "returns", "finance", "reports", "audit", "notifications", "promotions"],
  catalog: ["catalog", "collections"], orders: ["orders", "returns"],
};
export const roleLabels: Record<Role, string> = { customer: "পাঠক", owner: "মালিক", manager: "ম্যানেজার", catalog: "ক্যাটালগ সম্পাদক", orders: "অর্ডার অপারেটর" };
export type SavedAddress = Customer & { id: string; label: string };
export type User = { id: string; name: string; email: string; emailVerified: boolean; passwordHash: string; role: Role; disabled: boolean; addresses: SavedAddress[]; createdAt: string; lastLoginAt?: string; authVersion?: number };
export type PublicUser = Omit<User, "passwordHash" | "authVersion">;
export type Session = { id: string; userId: string; expiresAt: string; createdAt?: string };
export type StaffRole = Exclude<Role, "customer">;
export type StaffInvitation = {
  id: string; name: string; email: string; role: StaffRole; tokenHash: string;
  createdAt: string; expiresAt: string; createdBy: string; acceptedAt?: string; userId?: string;
};
export type PublicStaffInvitation = Omit<StaffInvitation, "tokenHash"> & {
  status: "pending" | "accepted" | "expired"; deliveryStatus?: OutboxMessage["status"];
};
export type StaffMember = Pick<PublicUser, "id" | "name" | "email" | "role" | "disabled" | "createdAt" | "lastLoginAt" | "emailVerified"> & { activeSessions: number };
export type StaffActivity = Audit & { actorName: string; targetName: string };
export type StaffOverview = { users: StaffMember[]; invitations: PublicStaffInvitation[]; emailAvailable: boolean };
export type StaffDetail = { user: StaffMember; activity: StaffActivity[]; isLastOwner: boolean };
export type IdentityToken = { id: string; userId: string; purpose: "reset" | "verify"; expiresAt: string };
export type Review = { id: string; productId: string; userId: string; displayName: string; rating: number; text: string; status: "pending" | "approved" | "rejected" | "hidden"; verified: boolean; createdAt: string; updatedAt: string; moderationNote?: string };
export type Collection = { id: string; slug: string; title: string; description: string; reason: string; imageAssetId?: string; productIds: string[]; published: boolean; featured: boolean; sortOrder: number };
export type Asset = { id: string; filename: string; kind: "cover" | "gallery" | "preview" | "collection" | "receipt"; url?: string; mime: string; size: number; pages: number; productId?: string; createdAt: string };
export type Subscription = { id: string; userId: string; productId: string; active: boolean; lastVersion: number };
export type Notification = { id: string; userId: string; message: string; href: string; read: boolean; createdAt: string };
export type OutboxMessage = { id: string; userId: string; to: string; subject: string; text: string; type: "restock" | "preorder" | "reset" | "verify" | "invite"; status: "pending" | "unavailable" | "sending" | "sent" | "failed"; attempts: number; nextAttemptAt: string; leaseUntil?: string; createdAt: string; expiresAt?: string };
export type ReturnRequest = { id: string; orderId: string; userId: string; reason: string; items: { productId: string; quantity: number }[]; status: "requested" | "approved" | "rejected" | "received" | "withdrawn"; restocked: boolean; note: string; createdAt: string; receivedAt?: string; accounting?: { revenueMinor: number; costRecoveredMinor: number; unknownQuantity: number; lines?: { productId: string; revenueMinor: number; costRecoveredMinor: number; unknownQuantity: number }[] } };
export type Payment = { id: string; orderId: string; amount: number; reference: string; method: "cod" | "bank"; recordedBy: string; createdAt: string };
export type Refund = { id: string; returnId: string; orderId: string; amount: number; method: "cash" | "bank"; reference: string; status: "pending" | "completed" | "cancelled"; recordedBy: string; createdAt: string; completedAt?: string };
export type Supplier = { id: string; name: string; phone: string; email: string; address: string; note: string; active: boolean; createdAt: string };
export type PurchaseLine = { productId: string; title: string; quantity: number; unitCostMinor: number; received: number };
export type PurchaseReceipt = { id: string; requestId: string; items: { productId: string; quantity: number }[]; at: string; actor: string };
export type Purchase = {
  id: string; number: string; supplierId: string; supplierName: string; invoiceNo: string; date: string; dueDate?: string;
  lines: PurchaseLine[]; subtotalMinor: number; discountMinor: number; freightMinor: number; totalMinor: number;
  note: string; receiptAssetId?: string; receipts: PurchaseReceipt[]; requestId: string; requestHash?: string; createdAt: string; createdBy: string;
};
export type SupplierPayment = { id: string; purchaseId: string; amountMinor: number; reference: string; method: "cash" | "bank"; date: string; note: string; requestId: string; createdAt: string; createdBy: string };
export type StockChange = { before: number; after: number; added?: number; requestId?: string; purchaseId?: string };
export type StockHistoryEntry = { id: string; at: string; actorName: string; change: StockChange };
export type Audit = { id: string; actor: string; action: string; target: string; at: string; note?: string; change?: { beforeRole: Role; afterRole: Role; beforeDisabled: boolean; afterDisabled: boolean }; stockChange?: StockChange };
export type Coupon = { id: string; code: string; type: "percent" | "fixed"; value: number; minimumMinor: number; maximumMinor?: number; starts: string; ends: string; limit: number; productIds: string[]; active: boolean; version: number; createdAt: string };
export type Expense = { id: string; date: string; category: "packaging" | "courier" | "rent" | "other"; amountMinor: number; note: string; reference: string; requestId: string; createdAt: string; recordedBy: string; voidedAt?: string };
export type ImportBatch = { id: string; actor: string; requestId: string; hash: string; count: number; createdAt: string };
export type ShopData = { products: Product[]; orders: Order[]; users: User[]; sessions: Session[]; tokens: IdentityToken[]; staffInvitations: StaffInvitation[]; suppliers: Supplier[]; purchases: Purchase[]; supplierPayments: SupplierPayment[]; reviews: Review[]; collections: Collection[]; assets: Asset[]; subscriptions: Subscription[]; notifications: Notification[]; outbox: OutboxMessage[]; returns: ReturnRequest[]; payments: Payment[]; refunds: Refund[]; audit: Audit[]; coupons: Coupon[]; expenses: Expense[]; imports: ImportBatch[] };
export type InventoryMovement = StockHistoryEntry & { productId: string; title: string; action: string; note?: string };
export type InventoryData = {
  products: Pick<Product, "id" | "title" | "stock" | "lowStockThreshold" | "preorder">[];
  suppliers: Supplier[]; purchases: Purchase[]; payments: SupplierPayment[]; movements: InventoryMovement[];
};
export type AccountData = { user: PublicUser; orders: Order[]; notifications: Notification[]; subscriptions: Subscription[]; returns: ReturnRequest[]; reviews: Review[]; refunds: Pick<Refund, "id" | "returnId" | "amount" | "status" | "completedAt">[] };
export type SalesPeriod = { from: string; to: string; net: number };
export type RecentOrder = Pick<Order, "id" | "createdAt" | "total" | "status" | "demo"> & { customerName: string; quantity: number };
export type Dashboard = { orderCount: number; demoCount: number; cancelledCount: number; orderedTotal: number; deliveredSales: number; collected: number; refunded: number; netCollected: number; outstanding: number; lowStock: Product[]; salesTrend: SalesPeriod[]; recentOrders: RecentOrder[]; demo: boolean };
