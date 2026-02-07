"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tsyringe_1 = require("tsyringe");
const media_utils_1 = require("../../core/utils/media.utils");
const auth_middleware_1 = __importDefault(require("../../core/middlewares/auth.middleware"));
const roleCheck_middleware_1 = require("../../core/middlewares/roleCheck.middleware");
const AppError_1 = require("../../core/errors/AppError");
const uploadRouter = (0, express_1.Router)();
const mediaHandler = tsyringe_1.container.resolve("mediaHandler");
// Apply authentication and admin/employee role to all upload routes
uploadRouter.use(auth_middleware_1.default);
uploadRouter.use(roleCheck_middleware_1.adminOrEmployee);
// Upload Unite/Course logos
uploadRouter.post('/logo', mediaHandler.uploadSingleFile(media_utils_1.FileType.LOGO, 'logo'), (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const file = req.file;
        if (!file) {
            throw new AppError_1.BadRequestError('No logo file uploaded');
        }
        const fileInfo = mediaHandler.processUploadedFiles(file, media_utils_1.FileType.LOGO);
        // Canonical: return uploadedFiles array with {filename, path, size, url}
        res.json({
            uploadedFiles: fileInfo.map(f => ({
                filename: f.filename,
                path: f.path,
                size: f.size,
                url: f.url
            }))
        });
    }
    catch (error) {
        next(error);
    }
}));
// Upload explanation images/PDFs
uploadRouter.post('/explanation', mediaHandler.uploadMultipleFiles(media_utils_1.FileType.EXPLANATION, 'explanations', 10), (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const files = req.files;
        if (!files || files.length === 0) {
            throw new AppError_1.BadRequestError('No explanation files uploaded');
        }
        const fileInfos = mediaHandler.processUploadedFiles(files, media_utils_1.FileType.EXPLANATION);
        res.json({
            success: true,
            files: fileInfos,
            message: `${files.length} explanation file(s) uploaded successfully`
        });
    }
    catch (error) {
        next(error);
    }
}));
// Upload PDF documents
uploadRouter.post('/pdf', mediaHandler.uploadMultipleFiles(media_utils_1.FileType.PDF, 'pdfs', 10), (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const files = req.files;
        if (!files || files.length === 0) {
            throw new AppError_1.BadRequestError('No PDF files uploaded');
        }
        const fileInfos = mediaHandler.processUploadedFiles(files, media_utils_1.FileType.PDF);
        // Canonical: return uploadedFiles array with {filename, path, size, url}
        res.json({
            uploadedFiles: fileInfos.map(f => ({
                filename: f.filename,
                path: f.path,
                size: f.size,
                url: f.url
            }))
        });
    }
    catch (error) {
        next(error);
    }
}));
// Upload study pack media (images and/or PDFs)
uploadRouter.post('/study-pack-media', mediaHandler.uploadMixedFiles(media_utils_1.FileType.STUDY_PACK, [
    { name: 'images', maxCount: 15 },
    { name: 'pdfs', maxCount: 10 }
]), (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const files = req.files;
        const allFiles = [...(files.images || []), ...(files.pdfs || [])];
        if (allFiles.length === 0) {
            throw new AppError_1.BadRequestError('No study pack media files uploaded');
        }
        // Canonical: return uploadedImages and uploadedPdfs arrays separately
        const imageFiles = files.images || [];
        const pdfFiles = files.pdfs || [];
        const imageInfos = imageFiles.length > 0 ? mediaHandler.processUploadedFiles(imageFiles, media_utils_1.FileType.STUDY_PACK) : [];
        const pdfInfos = pdfFiles.length > 0 ? mediaHandler.processUploadedFiles(pdfFiles, media_utils_1.FileType.STUDY_PACK) : [];
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
    }
    catch (error) {
        next(error);
    }
}));
// Upload general images
uploadRouter.post('/image', mediaHandler.uploadMultipleFiles(media_utils_1.FileType.IMAGE, 'images', 10), (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const files = req.files;
        if (!files || files.length === 0) {
            throw new AppError_1.BadRequestError('No image files uploaded');
        }
        const fileInfos = mediaHandler.processUploadedFiles(files, media_utils_1.FileType.IMAGE);
        // Canonical: return uploadedFiles array with {filename, path, size, url}
        res.json({
            uploadedFiles: fileInfos.map(f => ({
                filename: f.filename,
                path: f.path,
                size: f.size,
                url: f.url
            }))
        });
    }
    catch (error) {
        next(error);
    }
}));
// Upload question explanation images
uploadRouter.post('/question-explanation', mediaHandler.uploadMultipleFiles(media_utils_1.FileType.EXPLANATION, 'explanationImages', 10), (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const files = req.files;
        if (!files || files.length === 0) {
            throw new AppError_1.BadRequestError('No question explanation images uploaded');
        }
        // Additional validation for question explanation images
        const maxFileSize = 15 * 1024 * 1024; // 15MB per file
        const allowedMimeTypes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
            'image/bmp', 'image/tiff', 'image/webp', 'image/svg+xml'
        ];
        for (const file of files) {
            if (file.size > maxFileSize) {
                throw new AppError_1.BadRequestError(`File ${file.originalname} exceeds maximum size of 15MB`);
            }
            if (!allowedMimeTypes.includes(file.mimetype)) {
                throw new AppError_1.BadRequestError(`File ${file.originalname} has invalid format. Only image files are allowed.`);
            }
        }
        const fileInfos = mediaHandler.processUploadedFiles(files, media_utils_1.FileType.EXPLANATION);
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
    }
    catch (error) {
        // Handle multer errors specifically
        if (error.code === 'LIMIT_FILE_SIZE') {
            next(new AppError_1.BadRequestError('File size exceeds the maximum limit of 15MB'));
        }
        else if (error.code === 'LIMIT_FILE_COUNT') {
            next(new AppError_1.BadRequestError('Too many files. Maximum 10 files allowed'));
        }
        else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            next(new AppError_1.BadRequestError('Unexpected file field. Use "explanationImages" field name'));
        }
        else {
            next(error);
        }
    }
}));
exports.default = uploadRouter;
