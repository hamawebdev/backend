import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  try {
    const res = await prisma.questionSource.create({
      data: { name: 'test-source-unique-' + Date.now() }
    });
    console.log("Success:", res);
  } catch (e) {
    console.error("Error:", e);
  }
}
main().finally(() => prisma.$disconnect());
