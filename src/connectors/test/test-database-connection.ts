/**
 * Simple test script to verify Prisma database connection
 * Run with: npx tsx src/connectors/test-database-connection.ts
 */

import { prisma } from '../database.js';

async function testConnection() {
  try {
    console.log('Testing database connection...');
    
    // Test basic connection
    await prisma.$connect();
    console.log('✅ Successfully connected to database');
    
    // Test a simple query to verify the connection works
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Successfully executed test query:', result);
    
    // Test if we can query the User table (should be empty initially)
    try {
      const userCount = await prisma.user.count();
      console.log(`✅ Current user count: ${userCount}`);
    } catch (error) {
      console.log('⚠️  User table does not exist yet - run migrations first');
      console.log('   Run: npm run prisma:migrate');
    }
    
    console.log('✅ All database tests passed!');
  } catch (error) {
    console.error('❌ Database connection test failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testConnection()
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
