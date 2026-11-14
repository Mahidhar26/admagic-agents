import { createHash, randomBytes } from 'node:crypto';

type PayStatus = 'paid' | 'pending_approval' | 'failed';

export interface QatomClient {
  purchase(p: { walletId: string; itemId: string; priceUsd: number; input: unknown; idempotencyKey: string }):
    Promise<{ status: PayStatus; purchaseId: string; receiptId?: string; receiptUrl?: string; output?: unknown; reason?: string }>;
  getPurchase(purchaseId: string): Promise<{ status: PayStatus; receiptId?: string; receiptUrl?: string; output?: unknown }>;
  payAccount(p: { fromWalletId: string; toAccountId: string; amountUsd: number; memo: string; idempotencyKey: string }):
    Promise<{ status: PayStatus; receiptId?: string; receiptUrl?: string; reason?: string }>;
  getWalletBalance(walletId: string): Promise<{ balanceUsd: number }>;
  verifyAccount(accountId: string): Promise<{ verified: boolean }>;
}

const APPROVAL_OVER_USD = 2;
const APPROVAL_MS = 3000;

/**
 * In-memory stand-in so both people can build before the live API is wired.
 * Amounts over $2 return pending_approval and auto-approve 3 s later (fake phone approval).
 * shortcut: balances live in process memory and reset on cold start; fine for mock mode only.
 */
export class MockQatomClient implements QatomClient {
  balances = new Map<string, number>();
  seen = new Map<string, { at: number; amount: number; id: string }>();
  constructor(private startBalanceUsd = Number(process.env.MOCK_WALLET_BALANCE_USD ?? 100), private now = () => Date.now()) {}

  private balance(w: string) {
    if (!this.balances.has(w)) this.balances.set(w, this.startBalanceUsd);
    return this.balances.get(w)!;
  }

  private charge(wallet: string, amount: number, key: string) {
    const prior = this.seen.get(key);
    if (prior) return prior; // idempotent: a retry never pays twice
    if (this.balance(wallet) < amount) return null;
    this.balances.set(wallet, +(this.balance(wallet) - amount).toFixed(2));
    // the purchase id carries its own start time so polling works across serverless instances
    const entry = { at: this.now(), amount, id: `mock_pur_${this.now()}_${createHash('sha256').update(key).digest('hex').slice(0, 10)}` };
    this.seen.set(key, entry);
    return entry;
  }

  private statusOf(at: number, amount: number): PayStatus {
    return amount > APPROVAL_OVER_USD && this.now() - at < APPROVAL_MS ? 'pending_approval' : 'paid';
  }

  private receipt(id: string) {
    const receiptId = `mock_rcpt_${id.slice(-10)}`;
    return { receiptId, receiptUrl: `https://qatom.example/receipts/${receiptId}` };
  }

  async purchase(p: Parameters<QatomClient['purchase']>[0]) {
    const e = this.charge(p.walletId, p.priceUsd, p.idempotencyKey);
    if (!e) return { status: 'failed' as const, purchaseId: '', reason: 'Wallet ceiling reached: top up the wallet' };
    const status = this.statusOf(e.at, e.amount);
    return { status, purchaseId: e.id, ...(status === 'paid' ? this.receipt(e.id) : {}) };
  }

  async getPurchase(purchaseId: string) {
    const [, , at] = purchaseId.split('_');
    // only amounts over the approval line ever wait, so a pending id here is one of those
    const status = this.now() - Number(at) < APPROVAL_MS ? 'pending_approval' as const : 'paid' as const;
    return { status, ...(status === 'paid' ? this.receipt(purchaseId) : {}) };
  }

  async payAccount(p: Parameters<QatomClient['payAccount']>[0]) {
    const e = this.charge(p.fromWalletId, p.amountUsd, p.idempotencyKey);
    if (!e) return { status: 'failed' as const, reason: 'Offer wallet ceiling reached' };
    const status = this.statusOf(e.at, e.amount);
    return { status, ...(status === 'paid' ? this.receipt(e.id) : {}) };
  }

  async getWalletBalance(walletId: string) {
    return { balanceUsd: this.balance(walletId) };
  }

  async verifyAccount(accountId: string) {
    return { verified: accountId.trim().length > 0 };
  }
}

/** Fill in once the Qatom team confirms the calls (see Open questions in the spec). */
export class LiveQatomClient implements QatomClient {
  constructor(private apiKey = process.env.QATOM_API_KEY) {}
  private todo(): never {
    void this.apiKey;
    throw new Error('LiveQatomClient: not wired yet. Set QATOM_MODE=mock or implement lib/qatom.ts');
  }
  // TODO(qatom): POST purchase of a catalog item; map response to {status, purchaseId, receiptId, receiptUrl}
  async purchase(): ReturnType<QatomClient['purchase']> { return this.todo(); }
  // TODO(qatom): poll a purchase while phone approval is pending
  async getPurchase(): ReturnType<QatomClient['getPurchase']> { return this.todo(); }
  // TODO(qatom): direct account payout, or fall back to split payouts on a sale
  async payAccount(): ReturnType<QatomClient['payAccount']> { return this.todo(); }
  // TODO(qatom): wallet balance
  async getWalletBalance(): ReturnType<QatomClient['getWalletBalance']> { return this.todo(); }
  // TODO(qatom): check that an account exists and is verified
  async verifyAccount(): ReturnType<QatomClient['verifyAccount']> { return this.todo(); }
}

const g = globalThis as unknown as { __qatom?: QatomClient };
export const qatom: QatomClient = (g.__qatom ??= process.env.QATOM_MODE === 'live' ? new LiveQatomClient() : new MockQatomClient());

export const WALLETS = {
  buyer: process.env.QATOM_BUYER_WALLET_ID ?? 'mock_buyer_wallet',
  offer: process.env.QATOM_OFFER_WALLET_ID ?? 'mock_offer_wallet',
};

export const ITEMS = {
  image: { itemId: process.env.QATOM_ITEM_IMAGE ?? 'mock_item_image', priceUsd: 0.99 },
  video: { itemId: process.env.QATOM_ITEM_VIDEO ?? 'mock_item_video', priceUsd: 1.99 },
  compare: { itemId: process.env.QATOM_ITEM_COMPARE ?? 'mock_item_compare', priceUsd: 2.99 },
} as const;

export const randomId = (bytes = 16) => randomBytes(bytes).toString('hex');
