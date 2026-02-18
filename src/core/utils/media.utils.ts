import { Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { injectable, singleton, inject } from "tsyringe";
import ResponseUtils from "./response.utils";
import {
  BadRequestError,
  NotFoundError,
  InternalServerError,
  ConflictError,
} from "../errors/AppError";
import { Prisma } from "@prisma/client";

export enum FileType {
  IMAGE = "images",
  PDF = "pdfs",
  LOGO = "logos",
  EXPLANATION = "explanations",
  STUDY_PACK = "study-packs"
}

export interface FileUploadOptions {
  fileType: FileType;
  maxSize?: number; // in bytes
  allowedExtensions?: string[];
}

export interface UploadedFileInfo {
  filename: string;
  originalname: string;
  mimetype: string;
  size: number;
  path: string;
  url: string;
}

@injectable()
@singleton()
export default class MediaHandler {
  private uploadDirectory = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, "../../../../", "uploads"));
  private subDirectories = {
    [FileType.IMAGE]: path.join(this.uploadDirectory, "images"),
    [FileType.PDF]: path.join(this.uploadDirectory, "pdfs"),
    [FileType.LOGO]: path.join(this.uploadDirectory, "logos"),
    [FileType.EXPLANATION]: path.join(this.uploadDirectory, "explanations"),
    [FileType.STUDY_PACK]: path.join(this.uploadDirectory, "study-packs")
  };

  private fileTypeConfig = {
    [FileType.IMAGE]: {
      maxSize: 10 * 1024 * 1024, // 10MB
      allowedTypes: /jpeg|jpg|png|gif|bmp|tiff|webp|svg/,
      mimeTypes: ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/bmp", "image/tiff", "image/webp", "image/svg+xml"]
    },
    [FileType.PDF]: {
      maxSize: 50 * 1024 * 1024, // 50MB
      allowedTypes: /pdf/,
      mimeTypes: ["application/pdf"]
    },
    [FileType.LOGO]: {
      maxSize: 5 * 1024 * 1024, // 5MB
      allowedTypes: /jpeg|jpg|png|gif|webp|svg/,
      mimeTypes: ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/svg+xml"]
    },
    [FileType.EXPLANATION]: {
      maxSize: 15 * 1024 * 1024, // 15MB
      allowedTypes: /jpeg|jpg|png|gif|bmp|tiff|webp|svg|pdf/,
      mimeTypes: ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/bmp", "image/tiff", "image/webp", "image/svg+xml", "application/pdf"]
    },
    [FileType.STUDY_PACK]: {
      maxSize: 20 * 1024 * 1024, // 20MB
      allowedTypes: /jpeg|jpg|png|gif|bmp|tiff|webp|svg|pdf/,
      mimeTypes: ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/bmp", "image/tiff", "image/webp", "image/svg+xml", "application/pdf"]
    }
  };

  constructor(@inject("responseUtils") private responseUtils: ResponseUtils) {
    try {
      // Create main upload directory
      if (!fs.existsSync(this.uploadDirectory)) {
        fs.mkdirSync(this.uploadDirectory, { recursive: true });
      }

      // Create subdirectories for each file type
      Object.values(this.subDirectories).forEach(dir => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });
    } catch (error) {
      throw new InternalServerError("Failed to initialize media storage");
    }
  }

  public createUploader = (fileType: FileType, options?: Partial<FileUploadOptions>) => {
    const config = this.fileTypeConfig[fileType];
    const maxSize = options?.maxSize || config.maxSize;

    return multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => {
          const destinationPath = this.subDirectories[fileType];
          cb(null, destinationPath);
        },
        filename: (req, file, cb) => {
          (async () => {
            try {
              const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
              const fileExtension = path.extname(file.originalname).toLowerCase();
              const finalFilename = `${fileType}_${uniqueSuffix}${fileExtension}`;
              cb(null, finalFilename);
            } catch (error) {
              cb(new InternalServerError("Failed to process file name"), "");
            }
          })();
        },
      }),
      limits: { fileSize: maxSize },
      fileFilter: (req, file, cb) => {
        (async () => {
          try {
            const isValidExtension = config.allowedTypes.test(path.extname(file.originalname).toLowerCase());
            const isValidMimeType = config.mimeTypes.includes(file.mimetype);

            if (isValidExtension && isValidMimeType) {
              cb(null, true);
            } else {
              cb(new BadRequestError(`Invalid file type for ${fileType}. Allowed types: ${config.mimeTypes.join(", ")}`));
            }
          } catch (error) {
            cb(new BadRequestError("Invalid file upload attempt"));
          }
        })();
      },
    });
  };

  // Specific uploaders for different file types
  public uploadImage = this.createUploader(FileType.IMAGE);
  public uploadPDF = this.createUploader(FileType.PDF);
  public uploadLogo = this.createUploader(FileType.LOGO);
  public uploadExplanation = this.createUploader(FileType.EXPLANATION);
  public uploadStudyPackMedia = this.createUploader(FileType.STUDY_PACK);

  // Middleware for single file upload
  public uploadSingleFile = (fileType: FileType, fieldName: string = 'file') => {
    return this.createUploader(fileType).single(fieldName);
  };

  // Middleware for multiple file upload
  public uploadMultipleFiles = (fileType: FileType, fieldName: string = 'files', maxCount: number = 5) => {
    return this.createUploader(fileType).array(fieldName, maxCount);
  };

  // Middleware for mixed file uploads (different field names)
  public uploadMixedFiles = (fileType: FileType, fields: Array<{ name: string; maxCount?: number }>) => {
    return this.createUploader(fileType).fields(fields);
  };

  public getFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { fileType, filename } = req.params;

      if (!filename) {
        throw new BadRequestError("No filename provided");
      }

      if (!Object.values(FileType).includes(fileType as FileType)) {
        throw new BadRequestError("Invalid file type");
      }

      const filePath = path.join(this.subDirectories[fileType as FileType], filename);

      try {
        await fs.promises.access(filePath);
      } catch (err: any) {
        throw new NotFoundError("File not found");
      }

      // Set appropriate headers based on file type
      const ext = path.extname(filename).toLowerCase();
      if (ext === '.pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      }

      // Send the file as response
      res.sendFile(filePath, (err) => {
        if (err) {
          next(new InternalServerError("Failed to serve file"));
        }
      });
    } catch (error) {
      next(error);
    }
  };

  // Legacy method for backward compatibility
  public getImage = this.getFile;

  public deleteFiles = async (files: Prisma.JsonValue | null, fileType?: FileType) => {
    if (!Array.isArray(files) || files.length === 0) return;

    const fileStrings = files.filter(
      (file): file is string => typeof file === "string",
    );

    try {
      await Promise.all(
        fileStrings.map(async (filename) => {
          let filePath: string;

          if (fileType) {
            // Delete from specific subdirectory
            filePath = path.join(this.subDirectories[fileType], filename);
          } else {
            // Search across all subdirectories (legacy support)
            const searchPaths = Object.values(this.subDirectories).map(dir =>
              path.join(dir, filename)
            );

            filePath = "";
            for (const searchPath of searchPaths) {
              try {
                await fs.promises.access(searchPath);
                filePath = searchPath;
                break;
              } catch (err) {
                // Continue searching
              }
            }

            if (!filePath) {
              // File not found in any directory, skip
              return;
            }
          }

          try {
            await fs.promises.access(filePath);
            await fs.promises.unlink(filePath);
          } catch (err: any) {
            if (err.code !== "ENOENT") {
              throw new InternalServerError(`Failed to delete file: ${filename}`);
            }
          }
        }),
      );
    } catch (error) {
      throw new InternalServerError("File deletion failed");
    }
  };

  // Legacy method for backward compatibility
  public deleteImage = (images: Prisma.JsonValue | null) => this.deleteFiles(images);

  // Utility method to get file URL
  public getFileUrl = (filename: string, fileType: FileType): string => {
    return `/api/media/${fileType}/${filename}`;
  };

  // Method to process uploaded files and return file info
  public processUploadedFiles = (files: Express.Multer.File | Express.Multer.File[], fileType: FileType): UploadedFileInfo[] => {
    const fileArray = Array.isArray(files) ? files : [files];

    return fileArray.map(file => ({
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
      url: this.getFileUrl(file.filename, fileType)
    }));
  };

  // Validate file before upload
  public validateFile = (file: Express.Multer.File, fileType: FileType): boolean => {
    const config = this.fileTypeConfig[fileType];

    const isValidExtension = config.allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const isValidMimeType = config.mimeTypes.includes(file.mimetype);
    const isValidSize = file.size <= config.maxSize;

    return isValidExtension && isValidMimeType && isValidSize;
  };

  // Get file type configuration
  public getFileTypeConfig = (fileType: FileType) => {
    return this.fileTypeConfig[fileType];
  };

  // Create a file info object from filename
  public createFileInfo = (filename: string, fileType: FileType): Partial<UploadedFileInfo> => {
    return {
      filename,
      url: this.getFileUrl(filename, fileType)
    };
  };
} 