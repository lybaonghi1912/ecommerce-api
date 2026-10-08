import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from './config.js';

const adapter = new PrismaPg({
  connectionString: config.databaseUrl,
  connectionTimeoutMillis: 2000,
  query_timeout: 2000,
});

export const prisma = new PrismaClient({ adapter });

