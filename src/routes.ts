import type { FastifyInstance } from 'fastify';
import { Database } from './db';

import type { Block } from './types';

export async function registerRoutes(fastify: FastifyInstance, db: Database) {
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
                      value: { type: 'number' }
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
  }, async (request, reply) => {
    try {
      // To be implemented
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to get balance'
      });
    }
  });

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
      // To be implemented
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to perform rollback'
      });
    }
  });
}