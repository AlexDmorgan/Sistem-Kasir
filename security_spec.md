# Security Specification - Kasir Kita POS

## 1. Data Invariants
- A transaction total must match the sum of its items' subtotals.
- A transaction must have at least one item.
- `createdAt` must be a server-side timestamp.
- MenuItem price must be positive.

## 2. The "Dirty Dozen" Payloads (Denial Tests)
1. **Identity Theft**: User A tries to read User B's private transaction list (if we add user-specific history).
2. **Price Injection**: User tries to create a transaction with a total of 1 Rupiah despite items costing 100,000.
3. **Menu Vandalism**: Unauthorized user trying to change item prices.
4. **Negative Price**: Creating a menu item with a negative price.
5. **Shadow Fields**: Adding `isVerifiedAdmin: true` to a transaction.
6. **ID Poisoning**: Using a 2KB string as a MenuItem ID.
7. **Future Dating**: Setting `createdAt` to 2099.
8. **Bypassing Verification**: Writing data with an unverified email.
9. **Blanket Read Scam**: Trying to list all transactions without any filters (if rules allow).
10. **State Skipping**: Trying to mark a transaction as "Refunded" without permission.
11. **Huge Array**: Transaction with 10,000 items to cause resource exhaustion.
12. **Settings Hijack**: Changing restaurant name to "Hacked Store".

## 3. Test Cases (Summary)
- `create` MenuItem: fails for non-admins.
- `update` MenuItem: fails for anyone except the specific admin email.
- `create` Transaction: succeeds for verified users.
- `list` Transactions: succeeds for verified users but must be restricted to their session or store.
- `create` Settings: restricted to admins.
