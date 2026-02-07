const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugCourseAnalytics() {
  try {
    console.log('=== Debugging Course Analytics ===');

    // First check if we can connect to the database at all
    console.log('\n0. Database connection test:');
    const userCount = await prisma.user.count();
    console.log('Total users in database:', userCount);

    const sessionCount = await prisma.quizSession.count();
    console.log('Total sessions in database:', sessionCount);

    const userId = 5053;

    // Check if user 5053 exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    console.log('User 5053 exists:', !!user);
    if (user) {
      console.log('User details:', { id: user.id, email: user.email, fullName: user.fullName });
    }
    
    // Check basic sessions
    console.log('\n1. Basic sessions for user 5053:');
    const basicSessions = await prisma.quizSession.findMany({
      where: {
        userId,
        completedAt: { not: null }
      },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        completedAt: true
      }
    });
    console.log('Found sessions:', basicSessions.length);
    basicSessions.forEach(s => console.log(`  - ${s.id}: ${s.title} (${s.type})`));
    
    // Check sessions with questions
    console.log('\n2. Sessions with session questions:');
    const sessionsWithQuestions = await prisma.quizSession.findMany({
      where: {
        userId,
        completedAt: { not: null }
      },
      include: {
        sessionQuestions: {
          select: {
            questionId: true
          }
        }
      }
    });
    
    sessionsWithQuestions.forEach(s => {
      console.log(`  - Session ${s.id}: ${s.sessionQuestions.length} questions`);
    });
    
    // Check sessions with full course relationships
    console.log('\n3. Sessions with full course relationships:');
    const fullSessions = await prisma.quizSession.findMany({
      where: {
        userId,
        completedAt: { not: null }
      },
      include: {
        sessionQuestions: {
          include: {
            question: {
              include: {
                course: {
                  include: {
                    module: true
                  }
                }
              }
            }
          }
        }
      }
    });
    
    console.log('Sessions with course relationships:', fullSessions.length);
    fullSessions.forEach(s => {
      console.log(`  - Session ${s.id}: ${s.sessionQuestions.length} questions`);
      s.sessionQuestions.forEach(sq => {
        const course = sq.question.course;
        if (course) {
          console.log(`    * Question ${sq.question.id} -> Course ${course.id}: ${course.name} (Module: ${course.module.name})`);
        } else {
          console.log(`    * Question ${sq.question.id} -> NO COURSE`);
        }
      });
    });
    
    // Test the exact query from our repository
    console.log('\n4. Testing exact repository query:');
    const whereConditions = {
      userId,
      completedAt: { not: null }
    };
    
    const repoSessions = await prisma.quizSession.findMany({
      where: whereConditions,
      include: {
        sessionQuestions: {
          include: {
            question: {
              include: {
                course: {
                  include: {
                    module: true
                  }
                }
              }
            }
          }
        },
        quizAttempts: {
          include: {
            question: {
              include: {
                course: {
                  include: {
                    module: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { completedAt: 'desc' },
      take: 20,
      skip: 0
    });
    
    console.log('Repository query result:', repoSessions.length, 'sessions');
    
    if (repoSessions.length > 0) {
      const session = repoSessions[0];
      console.log(`First session: ${session.id} - ${session.title}`);
      console.log(`Session questions: ${session.sessionQuestions.length}`);
      console.log(`Quiz attempts: ${session.quizAttempts.length}`);
      
      // Check if questions have courses
      const questionsWithCourses = session.sessionQuestions.filter(sq => sq.question.course !== null);
      console.log(`Questions with courses: ${questionsWithCourses.length}`);
    }
    
  } catch (error) {
    console.error('Debug error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugCourseAnalytics();
