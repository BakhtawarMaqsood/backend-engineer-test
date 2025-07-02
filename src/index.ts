import Fastify from 'fastify';
import { Pool } from 'pg';
import { Database } from './db';
import { registerRoutes } from './routes';

const fastify = Fastify({ logger: true });

fastify.get('/', async (request, reply) => {
  return { hello: 'world' };
});

async function bootstrap() {
  console.log('Bootstrapping...');
  const isTestMode = process.env.NODE_ENV === 'test';

  const databaseUrl = isTestMode ? process.env.TEST_DATABASE_URL: process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  
  console.log('Test mode:', isTestMode);

  const pool = new Pool({
    connectionString: databaseUrl
  });

  const db = new Database(pool);
    await db.createTables();
    console.log('Database tables created successfully');

  await registerRoutes(fastify, db);
  console.log('Routes registered successfully');
}

try {
  await bootstrap();
  await fastify.listen({
    port: 3000,
    host: '0.0.0.0'
  })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
};
