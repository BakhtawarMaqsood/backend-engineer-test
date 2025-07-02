import { Pool } from 'pg';
import { createHash } from 'crypto';
import type { Block, Transaction } from './types';

export class Database {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async createTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS blocks (
        id TEXT PRIMARY KEY,
        height INTEGER UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        block_id TEXT REFERENCES blocks(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS inputs (
        id SERIAL PRIMARY KEY,
        transaction_id TEXT REFERENCES transactions(id) ON DELETE CASCADE,
        tx_id TEXT NOT NULL,
        index INTEGER NOT NULL,
        value NUMERIC NOT NULL,
        address TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS outputs (
        id SERIAL PRIMARY KEY,
        transaction_id TEXT REFERENCES transactions(id) ON DELETE CASCADE,
        address TEXT NOT NULL,
        value NUMERIC NOT NULL,
        index INTEGER NOT NULL,
        is_spent BOOLEAN DEFAULT FALSE,
        spent_by_transaction_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (transaction_id, index)
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS balances (
        address TEXT PRIMARY KEY,
        balance NUMERIC DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  async cleanupDatabase(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      if (process.env.NODE_ENV !== 'test') {
        throw new Error('Cleanup is only allowed in test mode');
      }

      await client.query('DELETE FROM balances');
      await client.query('DELETE FROM outputs');
      await client.query('DELETE FROM inputs');
      await client.query('DELETE FROM transactions');
      await client.query('DELETE FROM blocks');
      
      await client.query('COMMIT');
      console.log('Database cleaned successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getCurrentHeight(): Promise<number> {
      const result = await this.pool.query(`
        SELECT COALESCE(MAX(height), 0) as current_height FROM blocks
      `);
      return parseInt(result.rows[0].current_height);
  }

  async validateBlockId(block: Block): Promise<boolean> {
      const transactionIds = block.transactions.map(tx => tx.id).join('');
      const expectedId = createHash('sha256')
        .update(block.height.toString() + transactionIds)
        .digest('hex');
      
      return block.id === expectedId;
  }

  async validateInputOutputBalance(transactions: Transaction[]): Promise<boolean> {
      for (const transaction of transactions) {
        let inputSum = 0;
        let outputSum = 0;

        if (transaction.inputs.length > 0) {
          for (const input of transaction.inputs) {
            const result = await this.pool.query(`
              SELECT value FROM outputs 
              WHERE transaction_id = $1 AND index = $2 AND is_spent = FALSE
            `, [input.txId, input.index]);
            
            if (result.rows.length === 0) {
              return false;
            }
            inputSum += parseFloat(result.rows[0].value);
          }
        }

        for (const output of transaction.outputs) {
          outputSum += output.value;
        }

        if (transaction.inputs.length > 0) {
          if (Math.abs(inputSum - outputSum) > 0.000001) {
            return false;
          }
        } else {
          if (outputSum <= 0) {
            return false;
          }
        }
      }
      return true;
  }

  async addBlock(block: Block): Promise<void> {
      const client = await this.pool.connect();
      
      try {
        await client.query('BEGIN');

        await client.query(`
          INSERT INTO blocks (id, height) VALUES ($1, $2)
        `, [block.id, block.height]);

        for (const transaction of block.transactions) {
          await this.processTransaction(client, transaction, block.id);
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
    }
  }

  private async processTransaction(client: any, transaction: Transaction, blockId: string): Promise<void> {
    await client.query(`
      INSERT INTO transactions (id, block_id) VALUES ($1, $2)
    `, [transaction.id, blockId]);

    for (const input of transaction.inputs) {
      await client.query(`
        UPDATE outputs SET is_spent = TRUE, spent_by_transaction_id = $1
        WHERE transaction_id = $2 AND index = $3
      `, [transaction.id, input.txId, input.index]);

      const result = await client.query(`
        SELECT address, value FROM outputs 
        WHERE transaction_id = $1 AND index = $2
      `, [input.txId, input.index]);

      if (result.rows.length > 0) {
        const { address, value } = result.rows[0];
        const negativeValue = -parseFloat(value);
        
        await client.query(`
          INSERT INTO balances (address, balance) VALUES ($1, $2)
          ON CONFLICT (address) DO UPDATE SET 
            balance = balances.balance + $2,
            updated_at = CURRENT_TIMESTAMP
        `, [address, negativeValue]);
      }
    }

    for (let i = 0; i < transaction.outputs.length; i++) {
      const output = transaction.outputs[i];
      
      await client.query(`
        INSERT INTO outputs (transaction_id, address, value, index) 
        VALUES ($1, $2, $3, $4)
      `, [transaction.id, output.address, output.value, i]);

      await client.query(`
        INSERT INTO balances (address, balance) VALUES ($1, $2)
        ON CONFLICT (address) DO UPDATE SET 
          balance = balances.balance + $2,
          updated_at = CURRENT_TIMESTAMP
      `, [output.address, output.value]);
    }
  }

  async getBalance(address: string): Promise<number> {
    const result = await this.pool.query(`
      SELECT balance FROM balances WHERE address = $1
    `, [address]);
    
    return result.rows.length > 0 ? parseFloat(result.rows[0].balance) : 0;
  }

  async rollbackToHeight(height: number): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
  
      const txs = await client.query(`
        SELECT t.id FROM transactions t
        JOIN blocks b ON t.block_id = b.id
        WHERE b.height > $1
      `, [height]);
  
      const txIds = txs.rows.map(r => r.id);
  
      if (txIds.length > 0) {
        await client.query(`
          UPDATE outputs
          SET is_spent = FALSE, spent_by_transaction_id = NULL
          WHERE spent_by_transaction_id = ANY($1)
        `, [txIds]);
  
        await client.query(`
          DELETE FROM outputs
          WHERE transaction_id = ANY($1)
        `, [txIds]);
  
        await client.query(`
          DELETE FROM transactions WHERE id = ANY($1)
        `, [txIds]);
      }
  
      await client.query(`DELETE FROM blocks WHERE height > $1`, [height]);
  
      await client.query(`DELETE FROM balances`);
      await client.query(`
        INSERT INTO balances (address, balance)
        SELECT address, SUM(value)
        FROM outputs
        WHERE is_spent = FALSE
        GROUP BY address
      `);
  
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
