import { Router, Request, Response, NextFunction } from "express";
import { container } from "tsyringe";
import MediaHandler, { FileType } from "../../core/utils/media.utils";
import authMiddleware from "../../core/middlewares/auth.middleware";
import { adminOrEmployee } from "../../core/middlewares/roleCheck.middleware";
import { BadRequestError } from "../../core/errors/AppError";

const uploadRouter = Router();
const mediaHandler = container.resolve<MediaHandler>("mediaHandler");

// Apply authentication and admin/employee role to all upload routes
uploadRouter.use(authMiddleware);
uploadRouter.use(adminOrEmployee);

// Upload Unite/Course logos
uploadRouter.post('/logo',
  mediaHandler.uploadSingleFile(FileType.LOGO, 'logo'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = req.file;
      if (!file) {
        throw new BadRequestError('No logo file uploaded');
      }

      const fileInfo = mediaHandler.processUploadedFiles(file, FileType.LOGO);
      // Canonical: return uploadedFiles array with {filename, path, size, url}
      res.json({
        uploadedFiles: fileInfo.map(f => ({
          filename: f.filename,
          path: f.path,
          size: f.size,
          url: f.url
        }))
      });
    } catch (error) {
      next(error);
    }
  }
);

// Upload explanation images/PDFs
uploadRouter.post('/explanation',
  mediaHandler.uploadMultipleFiles(FileType.EXPLANATION, 'explanations', 10),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        throw new BadRequestError('No explanation files uploaded');
      }

      const fileInfos = mediaHandler.processUploadedFiles(files, FileType.EXPLANATION);
      res.json({
        success: true,
        files: fileInfos,
        message: `${files.length} explanation file(s) uploaded successfully`
      });
    } catch (error) {
      next(error);
    }
  }
);

// Upload PDF documents
uploadRouter.post('/pdf',
  mediaHandler.uploadMultipleFiles(FileType.PDF, 'pdfs', 10),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        throw new BadRequestError('No PDF files uploaded');
      }

      const fileInfos = mediaHandler.processUploadedFiles(files, FileType.PDF);
      // Canonical: return uploadedFiles array with {filename, path, size, url}
      res.json({
        uploadedFiles: fileInfos.map(f => ({
          filename: f.filename,
          path: f.path,
          size: f.size,
          url: f.url
        }))
      });
    } catch (error) {
      next(error);
    }
  }
);

// Upload study pack media (images and/or PDFs)
uploadRouter.post('/study-pack-media',
  mediaHandler.uploadMixedFiles(FileType.STUDY_PACK, [
    { name: 'images', maxCount: 15 },
    { name: 'pdfs', maxCount: 10 }
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      const allFiles = [...(files.images || []), ...(files.pdfs || [])];

      if (allFiles.length === 0) {
        throw new BadRequestError('No study pack media files uploaded');
      }

      // Canonical: return uploadedImages and uploadedPdfs arrays separately
      const imageFiles = files.images || [];
      const pdfFiles = files.pdfs || [];

      const imageInfos = imageFiles.length > 0 ? mediaHandler.processUploadedFiles(imageFiles, FileType.STUDY_PACK) : [];
      const pdfInfos = pdfFiles.length > 0 ? mediaHandler.processUploadedFiles(pdfFiles, FileType.STUDY_PACK) : [];

      res.json({
        uploadedImages: imageInfos.map(f => ({
          filename: f.filename,
          path: f.path,
          size: f.size,
          url: f.url
        })),
        uploadedPdfs: pdfInfos.map(f => ({
          filename: f.filename,
          path: f.path,
          size: f.size,
          url: f.url
        }))
      });
    } catch (error) {
      next(error);
    }
  }
);

// Upload general images
uploadRouter.post('/image',
  mediaHandler.uploadMultipleFiles(FileType.IMAGE, 'images', 10),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        throw new BadRequestError('No image files uploaded');
      }

      const fileInfos = mediaHandler.processUploadedFiles(files, FileType.IMAGE);
      // Canonical: return uploadedFiles array with {filename, path, size, url}
      res.json({
        uploadedFiles: fileInfos.map(f => ({
          filename: f.filename,
          path: f.path,
          size: f.size,
          url: f.url
        }))
      });
    } catch (error) {
      next(error);
    }
  }
);

// Upload question explanation images
uploadRouter.post('/question-explanation',
  mediaHandler.uploadMultipleFiles(FileType.EXPLANATION, 'explanationImages', 10),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        throw new BadRequestError('No question explanation images uploaded');
      }

      // Additional validation for question explanation images
      const maxFileSize = 15 * 1024 * 1024; // 15MB per file
      const allowedMimeTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
        'image/bmp', 'image/tiff', 'image/webp', 'image/svg+xml'
      ];

      for (const file of files) {
        if (file.size > maxFileSize) {
          throw new BadRequestError(`File ${file.originalname} exceeds maximum size of 15MB`);
        }

        if (!allowedMimeTypes.includes(file.mimetype)) {
          throw new BadRequestError(`File ${file.originalname} has invalid format. Only image files are allowed.`);
        }
      }

      const fileInfos = mediaHandler.processUploadedFiles(files, FileType.EXPLANATION);
      res.json({
        success: true,
        files: fileInfos,
        message: `${files.length} question explanation image(s) uploaded successfully`,
        uploadedFiles: fileInfos.map(file => ({
          filename: file.filename,
          originalname: file.originalname,
          url: file.url,
          size: file.size
        }))
      });
    } catch (error: any) {
      // Handle multer errors specifically
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(new BadRequestError('File size exceeds the maximum limit of 15MB'));
      } else if (error.code === 'LIMIT_FILE_COUNT') {
        next(new BadRequestError('Too many files. Maximum 10 files allowed'));
      } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        next(new BadRequestError('Unexpected file field. Use "explanationImages" field name'));
      } else {
        next(error);
      }
    }
  }
);

export default uploadRouter;