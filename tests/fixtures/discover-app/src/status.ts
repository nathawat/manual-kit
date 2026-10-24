export type OrderStatus = 'draft' | 'paid' | 'shipped' | 'refunded'
export const STEPS = ['cart', 'address', 'payment'] as const
