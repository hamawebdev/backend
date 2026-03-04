const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const res = await prisma.questionSource.create({
      data: { name: 'test_source_' + Date.now() }
    });
    console.log('Created!', res);
  } catch (err) {
    console.error('Error:', err.code, err.meta);
  } finally {
    await prisma.$disconnect();
  }
}
main();
