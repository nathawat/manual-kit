export type Role = 'customer' | 'staff' | 'admin'
export function requireRole(role: string) { return role }
export function canRefund(user: { role: string }) { return user.role === 'staff' || hasPermission('orders.refund') }
declare function hasPermission(p: string): boolean
