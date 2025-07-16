import type { FastifyInstance } from 'fastify';
import type { IDatabase } from './types';

import type { Block } from './types';


import type { FastifyReply, FastifyRequest } from 'fastify';
export function getBalanceHandler(db: IDatabase) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { address } = (request.params as { address: string });
      const balance = await db.getBalance(address);
      return reply.status(200).send({
        address,
        balance: balance.toString()
      });
    } catch (error) {
      request.server.log.error(error);
      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to get balance'
      });
    }
  };
}

export function getBalanceHandlerPure(db: IDatabase) {
  return async (address: string) => {
    try {
      const balance = await db.getBalance(address);
      return { status: 200, body: { address, balance: balance.toString() } };
    } catch (error) {
      return { status: 500, body: { error: 'Internal server error', message: 'Failed to get balance' } };
    }
  };
}

export async function registerRoutes(fastify: FastifyInstance, db: IDatabase) {
  fastify.post('/blocks', {
    schema: {
      body: {
        type: 'object',
        required: ['id', 'height', 'transactions'],
        properties: {
          id: { type: 'string' },
          height: { type: 'number' },
          transactions: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'inputs', 'outputs'],
              properties: {
                id: { type: 'string' },
                inputs: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['txId', 'index'],
                    properties: {
                      txId: { type: 'string' },
                      index: { type: 'number' }
                    }
                  }
                },
                outputs: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['address', 'value'],
                    properties: {
                      address: { type: 'string' },
                      value: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const block = request.body as Block;
      
      const currentHeight = await db.getCurrentHeight();
      if (block.height !== currentHeight + 1) {
        return reply.status(400).send({
          error: 'Invalid block height',
          message: `Expected height ${currentHeight + 1}, got ${block.height}`
        });
      }

      const isValidBlockId = await db.validateBlockId(block);
      if (!isValidBlockId) {
        return reply.status(400).send({
          error: 'Invalid block ID',
          message: 'Block ID does not match the expected hash'
        });
      }

      const isValidBalance = await db.validateInputOutputBalance(block.transactions);
      if (!isValidBalance) {
        return reply.status(400).send({
          error: 'Invalid transaction balance',
          message: 'Sum of inputs does not equal sum of outputs'
        });
      }

      await db.addBlock(block);
      
      return reply.status(200).send({
        message: 'Block added successfully',
        height: block.height
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to process block'
      });
    }
  });

  fastify.get('/balance/:address', {
    schema: {
      params: {
        type: 'object',
        required: ['address'],
        properties: {
          address: { type: 'string' }
        }
      }
    }
  }, getBalanceHandler(db));

  fastify.post('/rollback', {
    schema: {
      querystring: {
        type: 'object',
        required: ['height'],
        properties: {
          height: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { height } = request.query as { height: number };
      const currentHeight = await db.getCurrentHeight();
      
      if (height < 0 || height > currentHeight) {
        return reply.status(400).send({
          error: 'Invalid rollback height',
          message: `Height must be between 0 and ${currentHeight}`
        });
      }

      if (currentHeight - height > 2000) {
        return reply.status(400).send({
          error: 'Rollback too far',
          message: 'Cannot rollback more than 2000 blocks'
        });
      }

      await db.rollbackToHeight(height);
      
      return reply.status(200).send({
        message: 'Rollback completed successfully',
        rolledBackTo: height
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to perform rollback'
      });
    }
  });
}
