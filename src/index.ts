import Fastify from 'fastify';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

const fastify = Fastify({ logger: true });

fastify.get('/', async (request, reply) => {
  return { hello: 'world' };
});

async function testPostgres(pool: Pool) {
  const id = randomUUID();
  const name = 'Satoshi';
  const email = 'Nakamoto';

  await pool.query(`DELETE FROM users;`);

  await pool.query(`
    INSERT INTO users (id, name, email)
    VALUES ($1, $2, $3);
  `, [id, name, email]);

  const { rows } = await pool.query(`
    SELECT * FROM users;
  `);

  console.log('USERS', rows);
}

async function createTables(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL
    );
  `);
}

async function bootstrap() {
  console.log('Bootstrapping...');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({
    connectionString: databaseUrl
  });

  await createTables(pool);
  await testPostgres(pool);
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