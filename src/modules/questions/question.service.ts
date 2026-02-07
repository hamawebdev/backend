import { Question, QuestionType, YearLevel, PrismaClient } from "@prisma/client";
import { TransactionClient } from "../../types/prisma.types";
import { inject, injectable } from "tsyringe";
import PrismaService from "../../config/db";
import {
  CreateQuestionDto,
  BulkCreateQuestionsDto,
  UnifiedQuestionFilters,
  CreateQuestionResponse,
  BulkCreateQuestionsResponse,
  UpdateQuestionExplanationDto,
  UpdateQuestionExplanationResponse,
  AddQuestionExplanationImagesDto,
  UpdateQuestionExplanationImageDto,
  QuestionExplanationImageResponse
} from "../../types/quiz.types";
import { BadRequestError, NotFoundError } from "../../core/errors/AppError";

@injectable()
export default class QuestionService {
  constructor(@inject("db") private prismaService: PrismaService) { }

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }

  /**
   * Create a single question with unified metadata
   */
  async createQuestion(
    questionData: CreateQuestionDto,
    createdById: number
  ): Promise<CreateQuestionResponse> {
    // Validate question type vs correct answers
    const correctAnswersCount = questionData.answers.filter(a => a.isCorrect).length;

    if (questionData.questionType === QuestionType.SINGLE_CHOICE && correctAnswersCount !== 1) {
      throw new BadRequestError("Single choice questions must have exactly one correct answer");
    }

    if (questionData.questionType === QuestionType.MULTIPLE_CHOICE && correctAnswersCount < 2) {
      throw new BadRequestError("Multiple choice questions must have at least two correct answers");
    }

    // Validate references
    await this.validateReferences(questionData);

    const question = await this.prisma.question.create({
      data: {
        questionText: questionData.questionText,
        explanation: questionData.explanation,
        questionType: questionData.questionType || QuestionType.SINGLE_CHOICE,
        courseId: questionData.courseId,
        examId: questionData.examId,
        sourceId: questionData.sourceId,
        universityId: questionData.universityId,
        yearLevel: questionData.yearLevel,
        examYear: questionData.examYear,
        metadata: questionData.metadata,
        createdById,
        questionImages: questionData.questionImages ? {
          create: questionData.questionImages.map(img => ({
            imagePath: img.imagePath,
            altText: img.altText
          }))
        } : undefined,
        questionExplanationImages: questionData.explanationImages ? {
          create: questionData.explanationImages.map(img => ({
            imagePath: img.imagePath,
            altText: img.altText
          }))
        } : undefined,
        questionAnswers: {
          create: questionData.answers.map(answer => ({
            answerText: answer.answerText,
            isCorrect: answer.isCorrect,
            explanation: answer.explanation,
            explanationImages: answer.images ? {
              create: answer.images.map(img => ({
                imagePath: img.imagePath,
                altText: img.altText
              }))
            } : undefined
          }))
        }
      },
      include: {
        questionImages: true,
        questionExplanationImages: true,
        questionAnswers: {
          include: {
            explanationImages: true
          }
        }
      }
    });

    // Return canonical response format
    return {
      success: true,
      data: {
        id: question.id,
        questionText: question.questionText,
        questionType: question.questionType,
        courseId: question.courseId ?? undefined,
        answers: question.questionAnswers.map(a => ({
          id: a.id,
          answerText: a.answerText,
          isCorrect: a.isCorrect
        })),
        explanation: question.explanation ?? undefined,
        universityId: question.universityId ?? undefined,
        yearLevel: question.yearLevel ?? undefined,
        examYear: question.examYear ?? undefined,
        sourceId: question.sourceId ?? undefined,
        createdAt: question.createdAt
      },
      message: "Question created successfully"
    };
  }

  /**
   * Create multiple questions with shared metadata
   * Returns canonical format: {created, failed, errors[]}
   */
  async createQuestionsInBulk(
    bulkData: BulkCreateQuestionsDto,
    createdById: number
  ): Promise<BulkCreateQuestionsResponse> {
    const { metadata, questions } = bulkData;

    // Validate shared metadata references
    await this.validateReferences(metadata);

    let created = 0;
    let failed = 0;
    const errors: Array<{ index: number; error: string }> = [];

    // Process each question individually to track errors
    for (let index = 0; index < questions.length; index++) {
      const questionData = questions[index];

      try {
        // Validate question type vs correct answers
        const correctAnswersCount = questionData.answers.filter(a => a.isCorrect).length;

        if (questionData.questionType === QuestionType.SINGLE_CHOICE && correctAnswersCount !== 1) {
          throw new Error("Single choice questions must have exactly one correct answer");
        }

        if (questionData.questionType === QuestionType.MULTIPLE_CHOICE && correctAnswersCount < 2) {
          throw new Error("Multiple choice questions must have at least two correct answers");
        }

        // Create the question
        await this.prisma.question.create({
          data: {
            questionText: questionData.questionText,
            explanation: questionData.explanation,
            questionType: questionData.questionType || QuestionType.SINGLE_CHOICE,
            courseId: metadata.courseId,
            examId: metadata.examId,
            sourceId: metadata.sourceId,
            universityId: metadata.universityId,
            yearLevel: metadata.yearLevel,
            examYear: metadata.examYear,
            metadata: metadata.metadata,
            createdById,
            questionImages: questionData.questionImages ? {
              create: questionData.questionImages.map(img => ({
                imagePath: img.imagePath,
                altText: img.altText
              }))
            } : undefined,
            questionExplanationImages: questionData.explanationImages ? {
              create: questionData.explanationImages.map(img => ({
                imagePath: img.imagePath,
                altText: img.altText
              }))
            } : undefined,
            questionAnswers: {
              create: questionData.answers.map(answer => ({
                answerText: answer.answerText,
                isCorrect: answer.isCorrect,
                explanation: answer.explanation,
                explanationImages: answer.images ? {
                  create: answer.images.map(img => ({
                    imagePath: img.imagePath,
                    altText: img.altText
                  }))
                } : undefined
              }))
            }
          }
        });

        created++;
      } catch (error: any) {
        failed++;
        errors.push({
          index,
          error: error.message || "Failed to create question"
        });
      }
    }

    return {
      success: true,
      data: {
        created,
        failed,
        errors
      },
      message: `Created ${created} questions, ${failed} failed`
    };
  }

  /**
   * Update question explanation with comprehensive image management
   */
  async updateQuestionExplanation(
    questionId: number,
    explanationData: UpdateQuestionExplanationDto,
    updatedById: number
  ): Promise<UpdateQuestionExplanationResponse> {
    // Check if question exists and get current explanation images
    const existingQuestion = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: {
        questionExplanationImages: true,
        questionAnswers: {
          include: {
            explanationImages: true
          }
        }
      }
    });

    if (!existingQuestion) {
      throw new NotFoundError(`Question with ID ${questionId} not found`);
    }

    // Validate explanation images if provided
    if (explanationData.explanationImages && explanationData.explanationImages.length > 0) {
      this.validateExplanationImages(explanationData.explanationImages);
    }

    // Update question explanation and handle images in transaction
    const result = await this.prisma.$transaction(async (tx: TransactionClient) => {
      // Update the question explanation
      const question = await tx.question.update({
        where: { id: questionId },
        data: {
          explanation: explanationData.explanation,
          updatedAt: new Date()
        }
      });

      let finalImageCount = existingQuestion.questionExplanationImages.length;
      let addedImages = 0;
      let replacedImages = false;

      // Handle explanation images if provided
      if (explanationData.explanationImages && explanationData.explanationImages.length > 0) {
        // Check if we're replacing all images or adding to existing ones
        const totalImagesAfterUpdate = existingQuestion.questionExplanationImages.length + explanationData.explanationImages.length;

        if (totalImagesAfterUpdate > 10) {
          // If adding would exceed limit, replace existing images
          await tx.questionExplanationImage.deleteMany({
            where: { questionId: questionId }
          });
          replacedImages = true;
          finalImageCount = 0;
        }

        // Add new explanation images
        const sanitizedImages = explanationData.explanationImages.map(img => ({
          questionId: questionId,
          imagePath: img.imagePath.split('/').pop() || img.imagePath, // Security: strip directories
          altText: img.altText?.trim() || null
        }));

        await tx.questionExplanationImage.createMany({
          data: sanitizedImages
        });

        addedImages = sanitizedImages.length;
        finalImageCount = replacedImages ? addedImages : finalImageCount + addedImages;
      }

      // Get updated question with all explanation images
      const updatedQuestionWithImages = await tx.question.findUnique({
        where: { id: questionId },
        include: {
          questionExplanationImages: {
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      return {
        question: updatedQuestionWithImages!,
        addedImages,
        replacedImages,
        finalImageCount
      };
    });

    // Return canonical response format
    return {
      success: true,
      data: {
        id: result.question.id,
        explanation: result.question.explanation || '',
        explanationImages: result.question.questionExplanationImages.map(img => ({
          id: img.id,
          imagePath: img.imagePath,
          altText: img.altText || null
        }))
      },
      message: result.replacedImages
        ? `Question explanation updated successfully. Replaced all images with ${result.addedImages} new image(s).`
        : `Question explanation updated successfully. Added ${result.addedImages} new image(s).`
    };
  }

  /**
   * Update a question and its answers (basic fields)
   */
  async updateQuestion(
    questionId: number,
    update: any,
    updatedById: number
  ) {
    const existing = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { questionAnswers: true }
    });
    if (!existing) {
      throw new NotFoundError(`Question with ID ${questionId} not found`);
    }

    // Validate references if provided
    await this.validateReferences(update);

    // If answers provided, we will upsert minimal fields
    const answersUpdate = Array.isArray(update.answers) ? update.answers : [];

    const result = await this.prisma.$transaction(async (tx: TransactionClient) => {
      // Build update data object
      const updateData: any = {
        updatedAt: new Date()
      };

      if (update.questionText !== undefined) updateData.questionText = update.questionText;
      if (update.explanation !== undefined) updateData.explanation = update.explanation;
      if (update.questionType !== undefined) updateData.questionType = update.questionType;
      if (update.courseId !== undefined) updateData.courseId = update.courseId;
      if (update.examId !== undefined) updateData.examId = update.examId;
      if (update.sourceId !== undefined) updateData.sourceId = update.sourceId;
      if (update.universityId !== undefined) updateData.universityId = update.universityId;
      if (update.yearLevel !== undefined) updateData.yearLevel = update.yearLevel;
      if (update.metadata !== undefined) updateData.metadata = update.metadata;

      const updatedQuestion = await tx.question.update({
        where: { id: questionId },
        data: updateData
      });

      // Upsert answers if provided
      for (const ans of answersUpdate) {
        if (ans.id) {
          await tx.questionAnswer.update({
            where: { id: ans.id },
            data: {
              answerText: ans.answerText,
              isCorrect: ans.isCorrect,
              explanation: ans.explanation
            }
          });
        } else {
          await tx.questionAnswer.create({
            data: {
              questionId: questionId,
              answerText: ans.answerText || '',
              isCorrect: ans.isCorrect || false,
              explanation: ans.explanation || null
            }
          });
        }
      }

      return updatedQuestion;
    });

    return {
      success: true,
      data: {
        question: {
          id: result.id,
          questionText: result.questionText,
          questionType: result.questionType,
          courseId: result.courseId ?? undefined,
          universityId: result.universityId ?? undefined,
          yearLevel: result.yearLevel ?? undefined,
          examYear: result.examYear ?? undefined
        }
      },
      message: 'Question updated successfully'
    };
  }

  /**
   * Delete a question
   * Returns canonical format: { message: "..." }
   */
  async deleteQuestion(questionId: number, deletedById: number) {
    const existing = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!existing) {
      throw new NotFoundError(`Question with ID ${questionId} not found`);
    }

    await this.prisma.$transaction(async (tx: TransactionClient) => {
      await tx.explanationImage.deleteMany({
        where: { answer: { questionId } }
      });
      await tx.questionAnswer.deleteMany({ where: { questionId } });
      await tx.questionImage.deleteMany({ where: { questionId } });
      await tx.quizQuestion.deleteMany({ where: { questionId } });
      await tx.examQuestion.deleteMany({ where: { questionId } });
      await tx.question.delete({ where: { id: questionId } });
    });

    return { message: "Question deleted successfully" };
  }

  /**
   * Get question by ID with images and answer explanation images
   */
  async getQuestionById(id: number) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: {
        questionImages: true,
        questionExplanationImages: true,
        questionAnswers: {
          include: { explanationImages: true }
        },
        university: {
          select: {
            id: true,
            name: true,
            country: true
          }
        },
        course: {
          include: {
            module: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        source: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    if (!question) throw new NotFoundError(`Question with ID ${id} not found`);
    return question;
  }

  /**
   * Add images to an existing question
   */
  async addQuestionImages(questionId: number, images: { imagePath: string; altText?: string }[], userId: number) {
    // Ensure question exists
    const exists = await this.prisma.question.findUnique({ where: { id: questionId }, select: { id: true } });
    if (!exists) throw new NotFoundError(`Question with ID ${questionId} not found`);

    if (!Array.isArray(images) || images.length === 0) {
      throw new BadRequestError("No images provided");
    }

    // Basic filename safety: strip directories
    const sanitized = images.map(img => ({
      imagePath: img.imagePath.split('/').pop() || img.imagePath,
      altText: img.altText
    }));

    await this.prisma.questionImage.createMany({
      data: sanitized.map(s => ({ questionId, imagePath: s.imagePath, altText: s.altText }))
    });

    const updated = await this.getQuestionById(questionId);
    return { questionId, imageCount: updated.questionImages.length };
  }

  /**
   * Update a specific image from a question
   */
  async updateQuestionImage(
    questionId: number,
    imageId: number,
    updateData: { imagePath: string; altText?: string },
    userId: number
  ) {
    // Verify the question exists
    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
      throw new NotFoundError(`Question with ID ${questionId} not found`);
    }

    // Verify the image exists and belongs to this question
    const existingImage = await this.prisma.questionImage.findUnique({ where: { id: imageId } });
    if (!existingImage || existingImage.questionId !== questionId) {
      throw new NotFoundError("Image not found for this question");
    }

    // Basic filename safety: strip directories
    const sanitizedImagePath = updateData.imagePath.split('/').pop() || updateData.imagePath;

    // Update the image
    const updatedImage = await this.prisma.questionImage.update({
      where: { id: imageId },
      data: {
        imagePath: sanitizedImagePath,
        altText: updateData.altText
      }
    });

    return {
      questionId,
      imageId,
      imagePath: updatedImage.imagePath,
      altText: updatedImage.altText
    };
  }

  /**
   * Delete a specific image from a question
   */
  async deleteQuestionImage(questionId: number, imageId: number, userId: number) {
    const img = await this.prisma.questionImage.findUnique({ where: { id: imageId } });
    if (!img || img.questionId !== questionId) {
      throw new NotFoundError("Image not found for this question");
    }

    await this.prisma.questionImage.delete({ where: { id: imageId } });
    return { questionId, imageId };
  }

  /**
   * Validate explanation image data
   */
  private validateExplanationImages(images: { imagePath: string; altText?: string }[]) {
    if (!Array.isArray(images) || images.length === 0) {
      throw new BadRequestError("No explanation images provided");
    }

    if (images.length > 10) {
      throw new BadRequestError("Maximum 10 explanation images allowed per question");
    }

    for (const img of images) {
      if (!img.imagePath || typeof img.imagePath !== 'string') {
        throw new BadRequestError("Invalid image path provided");
      }

      // Basic file extension validation
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.svg'];
      const extension = img.imagePath.toLowerCase().substring(img.imagePath.lastIndexOf('.'));
      if (!allowedExtensions.includes(extension)) {
        throw new BadRequestError(`Invalid image format: ${extension}. Allowed formats: ${allowedExtensions.join(', ')}`);
      }

      // Validate alt text if provided
      if (img.altText && typeof img.altText !== 'string') {
        throw new BadRequestError("Invalid alt text provided");
      }

      if (img.altText && img.altText.length > 255) {
        throw new BadRequestError("Alt text must be 255 characters or less");
      }
    }
  }

  /**
   * Add explanation images to an existing question
   */
  async addQuestionExplanationImages(
    questionId: number,
    images: { imagePath: string; altText?: string }[],
    userId: number
  ) {
    // Ensure question exists
    const exists = await this.prisma.question.findUnique({ where: { id: questionId }, select: { id: true } });
    if (!exists) throw new NotFoundError(`Question with ID ${questionId} not found`);

    // Validate images
    this.validateExplanationImages(images);

    // Check current image count to prevent exceeding limits
    const currentImages = await this.prisma.questionExplanationImage.count({
      where: { questionId }
    });

    if (currentImages + images.length > 10) {
      throw new BadRequestError(`Adding ${images.length} images would exceed the maximum limit of 10 images per question`);
    }

    // Basic filename safety: strip directories and validate
    const sanitized = images.map(img => ({
      imagePath: img.imagePath.split('/').pop() || img.imagePath,
      altText: img.altText?.trim() || null
    }));

    await this.prisma.questionExplanationImage.createMany({
      data: sanitized.map(s => ({ questionId, imagePath: s.imagePath, altText: s.altText }))
    });

    const updated = await this.getQuestionById(questionId);
    return { questionId, explanationImageCount: updated.questionExplanationImages.length };
  }

  /**
   * Update a specific explanation image from a question
   */
  async updateQuestionExplanationImage(
    questionId: number,
    imageId: number,
    updateData: { imagePath: string; altText?: string },
    userId: number
  ) {
    // Verify the question exists
    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
      throw new NotFoundError(`Question with ID ${questionId} not found`);
    }

    // Verify the explanation image exists and belongs to this question
    const existingImage = await this.prisma.questionExplanationImage.findUnique({ where: { id: imageId } });
    if (!existingImage || existingImage.questionId !== questionId) {
      throw new NotFoundError("Explanation image not found for this question");
    }

    // Basic filename safety: strip directories
    const sanitizedImagePath = updateData.imagePath.split('/').pop() || updateData.imagePath;

    // Update the explanation image
    const updatedImage = await this.prisma.questionExplanationImage.update({
      where: { id: imageId },
      data: {
        imagePath: sanitizedImagePath,
        altText: updateData.altText
      }
    });

    return {
      questionId,
      imageId,
      imagePath: updatedImage.imagePath,
      altText: updatedImage.altText
    };
  }

  /**
   * Delete a specific explanation image from a question
   */
  async deleteQuestionExplanationImage(questionId: number, imageId: number, userId: number) {
    const img = await this.prisma.questionExplanationImage.findUnique({ where: { id: imageId } });
    if (!img || img.questionId !== questionId) {
      throw new NotFoundError("Explanation image not found for this question");
    }

    await this.prisma.questionExplanationImage.delete({ where: { id: imageId } });
    return { questionId, imageId };
  }

  /**
   * Replace all question images with new ones
   * Used by PUT /admin/image/:questionId/question-images
   */
  async replaceQuestionImages(
    questionId: number,
    images: { imagePath: string; altText?: string | null }[]
  ) {
    // Ensure question exists
    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
      throw new NotFoundError(`Question with ID ${questionId} not found`);
    }

    // Delete all existing question images
    await this.prisma.questionImage.deleteMany({
      where: { questionId }
    });

    // Create new images
    const createdImages = await Promise.all(
      images.map(img =>
        this.prisma.questionImage.create({
          data: {
            questionId,
            imagePath: img.imagePath,
            altText: img.altText || null
          }
        })
      )
    );

    // Return canonical response format
    return {
      id: questionId,
      images: createdImages.map(img => ({
        id: img.id,
        imagePath: img.imagePath,
        altText: img.altText
      }))
    };
  }

  /**
   * Replace all explanation images with new ones
   * Used by PUT /admin/image/:questionId/explanation-images
   */
  async replaceExplanationImages(
    questionId: number,
    images: { imagePath: string; altText?: string | null }[]
  ) {
    // Ensure question exists
    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
      throw new NotFoundError(`Question with ID ${questionId} not found`);
    }

    // Delete all existing explanation images
    await this.prisma.questionExplanationImage.deleteMany({
      where: { questionId }
    });

    // Create new images
    const createdImages = await Promise.all(
      images.map(img =>
        this.prisma.questionExplanationImage.create({
          data: {
            questionId,
            imagePath: img.imagePath,
            altText: img.altText || null
          }
        })
      )
    );

    // Return canonical response format
    return {
      id: questionId,
      explanationImages: createdImages.map(img => ({
        id: img.id,
        imagePath: img.imagePath,
        altText: img.altText
      }))
    };
  }


  /**
   * Get questions with unified filtering
   */
  async getQuestionsWithFilters(
    filters: UnifiedQuestionFilters,
    accessibleStudyPackIds: number[],
    questionCount: number
  ): Promise<Question[]> {
    const whereConditions: any = {
      course: {
        module: {
          unite: {
            studyPackId: { in: accessibleStudyPackIds }
          }
        }
      }
    };

    // Apply filters
    if (filters.courseIds && filters.courseIds.length > 0) {
      whereConditions.courseId = { in: filters.courseIds };
    }

    if (filters.moduleIds && filters.moduleIds.length > 0) {
      whereConditions.course = {
        ...whereConditions.course,
        moduleId: { in: filters.moduleIds }
      };
    }

    if (filters.uniteIds && filters.uniteIds.length > 0) {
      whereConditions.course = {
        ...whereConditions.course,
        module: {
          uniteId: { in: filters.uniteIds }
        }
      };
    }

    if (filters.universityIds && filters.universityIds.length > 0) {
      whereConditions.universityId = { in: filters.universityIds };
    }

    if (filters.yearLevels && filters.yearLevels.length > 0) {
      whereConditions.yearLevel = { in: filters.yearLevels };
    }

    if (filters.examYears && filters.examYears.length > 0) {
      whereConditions.examYear = { in: filters.examYears };
    }

    if (filters.questionTypes && filters.questionTypes.length > 0) {
      whereConditions.questionType = { in: filters.questionTypes };
    }

    if (filters.examIds && filters.examIds.length > 0) {
      whereConditions.examId = { in: filters.examIds };
    }

    // Filter by question source IDs - direct question source filtering
    if (filters.questionSourceIds && filters.questionSourceIds.length > 0) {
      whereConditions.sourceId = { in: filters.questionSourceIds };
    }

    return await this.prisma.question.findMany({
      where: whereConditions,
      include: {
        questionAnswers: {
          include: {
            explanationImages: true
          }
        },
        questionImages: true,
        questionExplanationImages: true,
        course: {
          include: {
            module: {
              include: {
                unite: true
              }
            }
          }
        },
        university: {
          select: {
            id: true,
            name: true,
            country: true
          }
        },
        source: {
          select: {
            id: true,
            name: true
          }
        }
      },
      take: questionCount,
      orderBy: [
        { createdAt: 'desc' },
        { id: 'asc' }
      ]
    });
  }

  /**
   * Validate references exist in database
   */
  private async validateReferences(data: any): Promise<void> {
    if (data.courseId) {
      const course = await this.prisma.course.findUnique({ where: { id: data.courseId } });
      if (!course) {
        throw new BadRequestError(`Course with ID ${data.courseId} does not exist`);
      }
    }

    if (data.examId) {
      const exam = await this.prisma.exam.findUnique({ where: { id: data.examId } });
      if (!exam) {
        throw new BadRequestError(`Exam with ID ${data.examId} does not exist`);
      }
    }

    if (data.sourceId) {
      const source = await this.prisma.questionSource.findUnique({ where: { id: data.sourceId } });
      if (!source) {
        throw new BadRequestError(`Question source with ID ${data.sourceId} does not exist`);
      }
    }

    if (data.universityId) {
      const university = await this.prisma.university.findUnique({ where: { id: data.universityId } });
      if (!university) {
        throw new BadRequestError(`University with ID ${data.universityId} does not exist`);
      }
    }
  }

  /**
   * Get available filters for question selection
   */
  async getAvailableFilters(accessibleStudyPackIds: number[]): Promise<any> {
    const [courses, universities, examYears, questionTypes, questionSources, typeCounts] = await Promise.all([
      // Get available courses with question counts
      this.prisma.course.findMany({
        where: {
          module: {
            unite: {
              studyPackId: { in: accessibleStudyPackIds }
            }
          }
        },
        include: {
          module: {
            include: {
              unite: true
            }
          },
          _count: {
            select: { questions: true }
          }
        },
        orderBy: { name: 'asc' }
      }),

      // Get available universities
      this.prisma.university.findMany({
        where: {
          questions: {
            some: {
              course: {
                module: {
                  unite: {
                    studyPackId: { in: accessibleStudyPackIds }
                  }
                }
              }
            }
          }
        },
        orderBy: { name: 'asc' }
      }),

      // Get available exam years
      this.prisma.question.findMany({
        where: {
          examYear: { not: null },
          course: {
            module: {
              unite: {
                studyPackId: { in: accessibleStudyPackIds }
              }
            }
          }
        },
        select: { examYear: true },
        distinct: ['examYear'],
        orderBy: { examYear: 'desc' }
      }),

      // Get available question types
      this.prisma.question.findMany({
        where: {
          course: {
            module: {
              unite: {
                studyPackId: { in: accessibleStudyPackIds }
              }
            }
          }
        },
        select: { questionType: true },
        distinct: ['questionType']
      }),

      // Get available question sources
      this.prisma.questionSource.findMany({
        where: {
          questions: {
            some: {
              course: {
                module: {
                  unite: {
                    studyPackId: { in: accessibleStudyPackIds }
                  }
                }
              }
            }
          }
        },
        include: {
          _count: {
            select: { questions: true }
          }
        },
        orderBy: { name: 'asc' }
      }),

      // Grouped counts per course and type
      this.prisma.question.groupBy({
        by: ['courseId', 'questionType'],
        where: {
          course: {
            module: {
              unite: {
                studyPackId: { in: accessibleStudyPackIds }
              }
            }
          }
        },
        _count: { _all: true }
      })
    ]);

    // Build a quick lookup map: courseId -> { singleChoiceCount, multipleChoiceCount }
    const perCourseTypeCounts = new Map<number, { singleChoiceCount: number; multipleChoiceCount: number }>();
    (typeCounts as Array<{ courseId: number; questionType: any; _count: { _all: number } }>).forEach((row) => {
      const existing = perCourseTypeCounts.get(row.courseId) || { singleChoiceCount: 0, multipleChoiceCount: 0 };
      if (row.questionType === 'SINGLE_CHOICE') existing.singleChoiceCount += row._count._all;
      if (row.questionType === 'MULTIPLE_CHOICE') existing.multipleChoiceCount += row._count._all;
      perCourseTypeCounts.set(row.courseId, existing);
    });

    const coursesWithCounts = courses.map((c: any) => {
      const typeCount = perCourseTypeCounts.get(c.id) || { singleChoiceCount: 0, multipleChoiceCount: 0 };
      return {
        ...c,
        questionCount: c?._count?.questions ?? 0,
        singleChoiceCount: typeCount.singleChoiceCount,
        multipleChoiceCount: typeCount.multipleChoiceCount
      };
    });

    return {
      courses: coursesWithCounts,
      universities,
      examYears: examYears.map((q: any) => q.examYear).filter(Boolean),
      questionTypes: questionTypes.map((q: any) => q.questionType),
      questionSources: questionSources.map((qs: any) => ({
        id: qs.id,
        name: qs.name,
        questionCount: qs._count?.questions || 0
      }))
    };
  }
}
