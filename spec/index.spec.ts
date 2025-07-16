import { expect, test, describe, beforeAll } from "bun:test";
import { createHash } from 'crypto';
import type { Block, Transaction } from '../src/types';

const API_URL = process.env.API_URL || 'http://localhost:3000';

const createBlockId = (height: number, transactions: Transaction[]): string =>{
  const transactionIds = transactions.map(tx => tx.id).join('');
  return createHash('sha256')
    .update(height.toString() + transactionIds)
    .digest('hex');
}

describe('Blockchain Indexer API', () => {
  beforeAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      const response = await fetch(`${API_URL}/cleanup`, {
        method: 'POST'
      });
      if (response.ok) {
        console.log('Database cleaned before tests');
      }
    } catch (error) {
      console.log('Could not clean database, continuing with tests');
    }
  });

  describe('POST /blocks', () => {
    test('should accept first block with height 1', async () => {
      const block: Block = {
        id: createBlockId(1, [{
          id: 'tx1',
          inputs: [],
          outputs: [{
            address: 'addr1',
            value: 0.00005
          }]
        }]),
        height: 1,
        transactions: [{
          id: 'tx1',
          inputs: [],
          outputs: [{
            address: 'addr1',
            value: 0.00005
          }]
        }]
      };

      const response = await fetch(`${API_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(block)
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe('Block added successfully');
      expect(data.height).toBe(1);
    });

    test('should reject block with wrong height', async () => {
      const block: Block = {
        id: createBlockId(3, [{
          id: 'tx2',
          inputs: [],
          outputs: [{
            address: 'addr2',
            value: 5
          }]
        }]),
        height: 3,
        transactions: [{
          id: 'tx2',
          inputs: [],
          outputs: [{
            address: 'addr2',
            value: 5
          }]
        }]
      };

      const response = await fetch(`${API_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(block)
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid block height');
    });

    test('should reject block with invalid ID', async () => {
      const block: Block = {
        id: 'invalid-id',
        height: 2,
        transactions: [{
          id: 'tx2',
          inputs: [],
          outputs: [{
            address: 'addr2',
            value: 5
          }]
        }]
      };

      const response = await fetch(`${API_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(block)
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid block ID');
    });

    test('should accept valid block with transaction spending previous output', async () => {
      const block: Block = {
        id: createBlockId(2, [{
          id: 'tx2',
          inputs: [{
            txId: 'tx1',
            index: 0
          }],
          outputs: [{
            address: 'addr2',
            value: 0.0000283
          }, {
            address: 'addr3',
            value: 0.0000217
          }]
        }]),
        height: 2,
        transactions: [{
          id: 'tx2',
          inputs: [{
            txId: 'tx1',
            index: 0
          }],
          outputs: [{
            address: 'addr2',
            value: 0.0000283
          }, {
            address: 'addr3',
            value: 0.0000217
          }]
        }]
      };

      const response = await fetch(`${API_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(block)
      });

      expect(response.status).toBe(200);
    });

    test('should reject transaction with unbalanced inputs/outputs', async () => {
      const block: Block = {
        id: createBlockId(3, [{
          id: 'tx3',
          inputs: [{
            txId: 'tx2',
            index: 0
          }],
          outputs: [{
            address: 'addr4',
            value: 5
          }]
        }]),
        height: 3,
        transactions: [{
          id: 'tx3',
          inputs: [{
            txId: 'tx2',
            index: 0
          }],
          outputs: [{
            address: 'addr4',
            value: 6
          }]
        }]
      };

      const response = await fetch(`${API_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(block)
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid transaction balance');
    });
  })

  describe('GET /balance/:address', () => {
      test('should return 0 for non-existent address', async () => {
      const response = await fetch(`${API_URL}/balance/nonexistent`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.address).toBe('nonexistent');
      expect(data.balance).toBe('0');
    });

    test('should return correct balances', async () => {
      const response1 = await fetch(`${API_URL}/balance/addr1`);
      expect(response1.status).toBe(200);
      const data1 = await response1.json();
      expect(Number(data1.balance)).toBe(0);

      const response2 = await fetch(`${API_URL}/balance/addr2`);
      expect(response2.status).toBe(200);
      const data2 = await response2.json();
      expect(Number(data2.balance) / 1e8).toBe(0.0000283);

      const response3 = await fetch(`${API_URL}/balance/addr3`);
      expect(response3.status).toBe(200);
      const data3 = await response3.json();
      expect(Number(data3.balance) / 1e8).toBe(0.0000217);
    });
  });

  describe('POST /rollback', () => {
    test('should rollback to height 1', async () => {
      const response = await fetch(`${API_URL}/rollback?height=1`, {
        method: 'POST'
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe('Rollback completed successfully');
      expect(data.rolledBackTo).toBe(1);
    });

    test('should have correct balances after rollback', async () => {
      const response1 = await fetch(`${API_URL}/balance/addr1`);
      expect(response1.status).toBe(200);
      const data1 = await response1.json();
      expect(Number(data1.balance) / 1e8).toBe(0.00005);

      const response2 = await fetch(`${API_URL}/balance/addr2`);
      expect(response2.status).toBe(200);
      const data2 = await response2.json();
      expect(data2.balance).toBe('0');

      const response3 = await fetch(`${API_URL}/balance/addr3`);
      expect(response3.status).toBe(200);
      const data3 = await response3.json();
      expect(data3.balance).toBe('0');
    });

    test('should reject rollback to invalid height', async () => {
      const response = await fetch(`${API_URL}/rollback?height=999`, {
        method: 'POST'
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid rollback height');
    });

    test('should reject rollback to negative height', async () => {
      const response = await fetch(`${API_URL}/rollback?height=-1`, {
        method: 'POST'
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid rollback height');
    });
  });
})
