import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../src/app';
import { PrismaClient, YearLevel, SessionType } from '@prisma/client';

// Ids of the records created in beforeAll; the mocked auth reads them lazily so the
// test does not depend on running first against an empty database
const mockAuthIds = { userId: 0, studyPackId: 0 };

// Mock authentication middleware
jest.mock('../src/core/middlewares/auth.middleware', () => {
    return jest.fn((req: any, res: any, next: any) => {
        req.user = {
            user_data: {
                id: mockAuthIds.userId,
                email: 'test-student@example.com',
                fullName: 'Test Student',
                role: 'STUDENT',
                currentYear: 'THREE',
                emailVerified: true,
                isActive: true
            },
            subscriptions: [{
                id: 1,
                study_pack_id: mockAuthIds.studyPackId,
                pack_name: 'Test Study Pack',
                pack_type: 'standard',
                year_number: '3',
                end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                days_remaining: 30
            }],
            payment_status: 'active',
            has_active_subscription: true,
            accessible_study_packs: [mockAuthIds.studyPackId]
        };
        next();
    });
});

// Mock payment check middleware
jest.mock('../src/core/middlewares/paymentCheck.middleware', () => ({
    checkPayment: () => jest.fn((req: any, res: any, next: any) => next()),
}));

const prisma = new PrismaClient();

describe('Quiz Session Question Count API', () => {
    let authToken: string;
    let userId: number;
    let courseId: number;
    let questionIds: number[] = [];

    beforeAll(async () => {
        // Create a test user with active subscription
        const testUser = await prisma.user.create({
            data: {
                email: 'count-test-student@example.com',
                passwordHash: 'hashedpassword',
                fullName: 'Test Student',
                role: 'STUDENT',
                isActive: true,
                emailVerified: true,
                currentYear: YearLevel.THREE
            }
        });
        userId = testUser.id;
        mockAuthIds.userId = testUser.id;

        // Create test data structure: StudyPack -> Unite -> Module -> Course
        const studyPack = await prisma.studyPack.create({
            data: {
                name: 'Count Test Study Pack',
                description: 'Test study pack for count tests',
                type: 'STANDARD',
                yearNumber: '3',
                pricePerMonth: 100.0,
                isActive: true
            }
        });
        mockAuthIds.studyPackId = studyPack.id;

        const unite = await prisma.unite.create({
            data: {
                studyPackId: studyPack.id,
                name: 'Count Test Unite',
                description: 'Test unite for count tests'
            }
        });

        const module = await prisma.module.create({
            data: {
                uniteId: unite.id,
                name: 'Count Test Module',
                description: 'Test module for count tests'
            }
        });

        const course = await prisma.course.create({
            data: {
                moduleId: module.id,
                name: 'Count Test Course',
                description: 'Test course for count tests'
            }
        });
        courseId = course.id;

        // Create 10 test questions
        for (let i = 1; i <= 10; i++) {
            const q = await prisma.question.create({
                data: {
                    courseId: course.id,
                    questionText: `Count Test question ${i}`,
                    explanation: `Explanation ${i}`,
                    yearLevel: YearLevel.THREE,
                    createdById: userId,
                    questionType: 'SINGLE_CHOICE'
                }
            });
            questionIds.push(q.id);
        }
    });

    afterAll(async () => {
        // Clean up only this suite's data; other suites share the database
        const sessionIds = (await prisma.quizSession.findMany({
            where: { userId },
            select: { id: true }
        })).map(session => session.id);
        await prisma.quizAttempt.deleteMany({ where: { sessionId: { in: sessionIds } } });
        await prisma.quizSessionQuestion.deleteMany({ where: { sessionId: { in: sessionIds } } });
        await prisma.quizSession.deleteMany({ where: { id: { in: sessionIds } } });
        await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
        await prisma.course.deleteMany({ where: { id: courseId } });
        await prisma.module.deleteMany({ where: { unite: { studyPackId: mockAuthIds.studyPackId } } });
        await prisma.unite.deleteMany({ where: { studyPackId: mockAuthIds.studyPackId } });
        await prisma.studyPack.deleteMany({ where: { id: mockAuthIds.studyPackId } });
        await prisma.user.deleteMany({ where: { id: userId } });
        await prisma.$disconnect();
    });

    describe('POST /api/v1/quizzes/sessions', () => {
        it('should respect questionCount parameter when creating a session', async () => {
            const requestedCount = 5;

            const response = await request(app)
                .post('/api/v1/quizzes/sessions')
                .send({
                    title: 'Question Count Test Session',
                    courseIds: [courseId],
                    sessionType: 'PRACTISE',
                    questionCount: requestedCount
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toBeDefined();
            const sessionId = response.body.data.sessionId;
            expect(sessionId).toBeDefined();

            // Verify the session has exactly requestedCount questions
            const sessionQuestions = await prisma.quizSessionQuestion.findMany({
                where: { sessionId: sessionId }
            });

            expect(sessionQuestions.length).toBe(requestedCount);
        });

        it('should include all questions when questionCount is larger than available', async () => {
            const requestedCount = 20; // We only have 10 available

            const response = await request(app)
                .post('/api/v1/quizzes/sessions')
                .send({
                    title: 'Question Count Overflow Test Session',
                    courseIds: [courseId],
                    sessionType: 'PRACTISE',
                    questionCount: requestedCount
                });

            expect(response.status).toBe(201);

            // Verify the session has exactly 10 questions (all available)
            const sessionQuestions = await prisma.quizSessionQuestion.findMany({
                where: { sessionId: response.body.data.sessionId }
            });

            expect(sessionQuestions.length).toBe(10);
        });

        it('should match all questions when questionCount is NOT provided', async () => {
            const response = await request(app)
                .post('/api/v1/quizzes/sessions')
                .send({
                    title: 'No Count Test Session',
                    courseIds: [courseId],
                    sessionType: 'PRACTISE'
                    // No questionCount provided
                });

            expect(response.status).toBe(201);

            // Verify the session has all 10 questions
            const sessionQuestions = await prisma.quizSessionQuestion.findMany({
                where: { sessionId: response.body.data.sessionId }
            });

            expect(sessionQuestions.length).toBe(10);
        });
    });
});
