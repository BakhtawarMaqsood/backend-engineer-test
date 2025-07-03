# EMURGO Backend Engineer Challenge

This project implements a UTXO-based blockchain indexer. It tracks balances per address, supports block ingestion, and allows rollbacks.

---

## Endpoints

### `POST /blocks`
Accepts a block of transactions and updates balances.

**Validations include:**
- `height` must be exactly one more than the current block height
- Input value must equal output value
- `block.id` must match `sha256(height + tx1.id + tx2.id + ...)`
- UTXO state is updated and balances recalculated accordingly

---

### `GET /balance/:address`
Returns the current balance for the specified address.

---

### `POST /rollback?height=number`
Rolls back all blocks after the given height and recalculates balances based on remaining unspent outputs.

---

## Setup

### With Bun
```bash
bun start
```

---

## Testing

To run tests:

1. Start the server in test mode:
```bash
NODE_ENV=test bun start
```

2. In another terminal, run:
```bash
bun test


