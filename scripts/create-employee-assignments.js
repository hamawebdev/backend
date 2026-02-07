const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createEmployeeAssignments() {
  try {
    console.log('🔄 Creating employee assignments...');

    // Find an employee user
    const employee = await prisma.user.findFirst({
      where: { role: 'EMPLOYEE' }
    });

    if (!employee) {
      console.log('❌ No employee user found. Please create an employee user first.');
      return;
    }

    // Find an admin user for assignment tracking
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    });

    if (!admin) {
      console.log('❌ No admin user found. Please create an admin user first.');
      return;
    }

    // Get some courses to assign
    const courses = await prisma.course.findMany({
      take: 3,
      include: {
        module: {
          include: {
            unite: true
          }
        }
      }
    });

    if (courses.length === 0) {
      console.log('❌ No courses found. Please run the main seed script first.');
      return;
    }

    // Create course assignments
    for (const course of courses) {
      try {
        await prisma.employeeAssignment.create({
          data: {
            employeeId: employee.id,
            resourceType: 'course',
            resourceId: course.id,
            assignedBy: admin.id,
            isActive: true
          }
        });
        console.log(`✅ Assigned employee to course: ${course.name}`);
      } catch (error) {
        if (error.code === 'P2002') {
          console.log(`⚠️  Assignment already exists for course: ${course.name}`);
        } else {
          console.log(`❌ Error assigning course ${course.name}:`, error.message);
        }
      }
    }

    // Get some modules to assign
    const modules = await prisma.module.findMany({
      take: 2,
      include: {
        unite: true
      }
    });

    // Create module assignments
    for (const module of modules) {
      try {
        await prisma.employeeAssignment.create({
          data: {
            employeeId: employee.id,
            resourceType: 'module',
            resourceId: module.id,
            assignedBy: admin.id,
            isActive: true
          }
        });
        console.log(`✅ Assigned employee to module: ${module.name}`);
      } catch (error) {
        if (error.code === 'P2002') {
          console.log(`⚠️  Assignment already exists for module: ${module.name}`);
        } else {
          console.log(`❌ Error assigning module ${module.name}:`, error.message);
        }
      }
    }

    console.log('🎉 Employee assignments created successfully!');
    console.log(`Employee ${employee.email} can now manage:`);
    console.log(`- ${courses.length} courses`);
    console.log(`- ${modules.length} modules`);
    console.log(`- Plus all courses within assigned modules`);

  } catch (error) {
    console.error('❌ Error creating employee assignments:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createEmployeeAssignments(); 