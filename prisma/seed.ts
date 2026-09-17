import { prisma } from '../src/connectors/database.js';

async function main() {
  console.log('Seeding MVP service user...');

  // Check if service user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: 'service@semantic-layer.local' },
  });

  if (existingUser) {
    console.log('Service user already exists, skipping seed');
    return;
  }

  // Create MVP service user with ADMIN role
  const serviceUser = await prisma.user.create({
    data: {
      email: 'service@semantic-layer.local',
      name: 'Service User',
      role: 'ADMIN',
    },
  });

  console.log('Service user created:', serviceUser);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
