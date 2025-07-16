import { expect, test, describe } from "bun:test";
import type { Block, Transaction, IDatabase } from '../src/types';
import { getBalanceHandlerPure } from '../src/routes';

let createTablesCalled = false;
let cleanupDatabaseCalled = false;
let addBlockCalled: Block | undefined = undefined;
let rollbackToHeightCalled: number | undefined = undefined;

const mockDb: IDatabase = {
  createTables: async () => { createTablesCalled = true; },
  getCurrentHeight: async () => 42,
  validateBlockId: async (block: Block) => block.id === 'valid',
  validateInputOutputBalance: async (txs: Transaction[]) => txs.length > 0,
  addBlock: async (block: Block) => { addBlockCalled = block; },
  getBalance: async (address: string) => address === 'exists' ? 100n : 0n,
  rollbackToHeight: async (height: number) => { rollbackToHeightCalled = height; },
  toSatoshis: (v) => BigInt(Math.round(Number(v) * 100_000_000)),
};

describe('IDatabase interface unit tests', () => {
  test('createTables is called', async () => {
    createTablesCalled = false;
    await mockDb.createTables();
    expect(createTablesCalled).toBe(true);
  });

  test('getCurrentHeight returns expected value', async () => {
    const height = await mockDb.getCurrentHeight();
    expect(height).toBe(42);
  });

  test('validateBlockId returns true for valid block', async () => {
    const result = await mockDb.validateBlockId({ id: 'valid', height: 1, transactions: [] });
    expect(result).toBe(true);
  });

  test('validateBlockId returns false for invalid block', async () => {
    const result = await mockDb.validateBlockId({ id: 'invalid', height: 1, transactions: [] });
    expect(result).toBe(false);
  });

  test('validateInputOutputBalance returns true for non-empty txs', async () => {
    const result = await mockDb.validateInputOutputBalance([{ id: 'tx', inputs: [], outputs: [] }]);
    expect(result).toBe(true);
  });

  test('validateInputOutputBalance returns false for empty txs', async () => {
    const result = await mockDb.validateInputOutputBalance([]);
    expect(result).toBe(false);
  });

  test('addBlock is called with correct block', async () => {
    const block = { id: 'b', height: 1, transactions: [] };
    await mockDb.addBlock(block);
    expect(addBlockCalled).toBe(block);
  });

  test('getBalanceHandlerPure returns correct balance for existing address', async () => {
    const handler = getBalanceHandlerPure(mockDb);
    const result = await handler('exists');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ address: 'exists', balance: '100' });
  });

  test('getBalanceHandlerPure returns 0 for non-existent address', async () => {
    const handler = getBalanceHandlerPure(mockDb);
    const result = await handler('notfound');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ address: 'notfound', balance: '0' });
  });

  test('rollbackToHeight is called with correct height', async () => {
    await mockDb.rollbackToHeight(5);
    expect(rollbackToHeightCalled).toBe(5);
  });

  test('toSatoshis converts number to bigint satoshis', () => {
    expect(mockDb.toSatoshis(1)).toBe(100_000_000n);
    expect(mockDb.toSatoshis(0.00000001)).toBe(1n);
    expect(mockDb.toSatoshis('0.5')).toBe(50_000_000n);
  });
});
