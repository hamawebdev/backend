"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
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
exports.FileType = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const tsyringe_1 = require("tsyringe");
const response_utils_1 = __importDefault(require("./response.utils"));
const AppError_1 = require("../errors/AppError");
var FileType;
(function (FileType) {
    FileType["IMAGE"] = "images";
    FileType["PDF"] = "pdfs";
    FileType["LOGO"] = "logos";
    FileType["EXPLANATION"] = "explanations";
    FileType["STUDY_PACK"] = "study-packs";
})(FileType || (exports.FileType = FileType = {}));
let MediaHandler = class MediaHandler {
    constructor(responseUtils) {
        this.responseUtils = responseUtils;
        this.uploadDirectory = path_1.default.resolve(process.env.UPLOADS_DIR || path_1.default.join(__dirname, "../../../../", "uploads"));
        this.subDirectories = {
            [FileType.IMAGE]: path_1.default.join(this.uploadDirectory, "images"),
            [FileType.PDF]: path_1.default.join(this.uploadDirectory, "pdfs"),
            [FileType.LOGO]: path_1.default.join(this.uploadDirectory, "logos"),
            [FileType.EXPLANATION]: path_1.default.join(this.uploadDirectory, "explanations"),
            [FileType.STUDY_PACK]: path_1.default.join(this.uploadDirectory, "study-packs")
        };
        this.fileTypeConfig = {
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
        this.createUploader = (fileType, options) => {
            const config = this.fileTypeConfig[fileType];
            const maxSize = (options === null || options === void 0 ? void 0 : options.maxSize) || config.maxSize;
            return (0, multer_1.default)({
                storage: multer_1.default.diskStorage({
                    destination: (req, file, cb) => {
                        const destinationPath = this.subDirectories[fileType];
                        cb(null, destinationPath);
                    },
                    filename: (req, file, cb) => {
                        (() => __awaiter(this, void 0, void 0, function* () {
                            try {
                                const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
                                const fileExtension = path_1.default.extname(file.originalname).toLowerCase();
                                const finalFilename = `${fileType}_${uniqueSuffix}${fileExtension}`;
                                cb(null, finalFilename);
                            }
                            catch (error) {
                                cb(new AppError_1.InternalServerError("Failed to process file name"), "");
                            }
                        }))();
                    },
                }),
                limits: { fileSize: maxSize },
                fileFilter: (req, file, cb) => {
                    (() => __awaiter(this, void 0, void 0, function* () {
                        try {
                            const isValidExtension = config.allowedTypes.test(path_1.default.extname(file.originalname).toLowerCase());
                            const isValidMimeType = config.mimeTypes.includes(file.mimetype);
                            if (isValidExtension && isValidMimeType) {
                                cb(null, true);
                            }
                            else {
                                cb(new AppError_1.BadRequestError(`Invalid file type for ${fileType}. Allowed types: ${config.mimeTypes.join(", ")}`));
                            }
                        }
                        catch (error) {
                            cb(new AppError_1.BadRequestError("Invalid file upload attempt"));
                        }
                    }))();
                },
            });
        };
        // Specific uploaders for different file types
        this.uploadImage = this.createUploader(FileType.IMAGE);
        this.uploadPDF = this.createUploader(FileType.PDF);
        this.uploadLogo = this.createUploader(FileType.LOGO);
        this.uploadExplanation = this.createUploader(FileType.EXPLANATION);
        this.uploadStudyPackMedia = this.createUploader(FileType.STUDY_PACK);
        // Middleware for single file upload
        this.uploadSingleFile = (fileType, fieldName = 'file') => {
            return this.createUploader(fileType).single(fieldName);
        };
        // Middleware for multiple file upload
        this.uploadMultipleFiles = (fileType, fieldName = 'files', maxCount = 5) => {
            return this.createUploader(fileType).array(fieldName, maxCount);
        };
        // Middleware for mixed file uploads (different field names)
        this.uploadMixedFiles = (fileType, fields) => {
            return this.createUploader(fileType).fields(fields);
        };
        this.getFile = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { fileType, filename } = req.params;
                if (!filename) {
                    throw new AppError_1.BadRequestError("No filename provided");
                }
                if (!Object.values(FileType).includes(fileType)) {
                    throw new AppError_1.BadRequestError("Invalid file type");
                }
                const filePath = path_1.default.join(this.subDirectories[fileType], filename);
                try {
                    yield fs_1.default.promises.access(filePath);
                }
                catch (err) {
                    throw new AppError_1.NotFoundError("File not found");
                }
                // Set appropriate headers based on file type
                const ext = path_1.default.extname(filename).toLowerCase();
                if (ext === '.pdf') {
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
                }
                // Send the file as response
                res.sendFile(filePath, (err) => {
                    if (err) {
                        next(new AppError_1.InternalServerError("Failed to serve file"));
                    }
                });
            }
            catch (error) {
                next(error);
            }
        });
        // Legacy method for backward compatibility
        this.getImage = this.getFile;
        this.deleteFiles = (files, fileType) => __awaiter(this, void 0, void 0, function* () {
            if (!Array.isArray(files) || files.length === 0)
                return;
            const fileStrings = files.filter((file) => typeof file === "string");
            try {
                yield Promise.all(fileStrings.map((filename) => __awaiter(this, void 0, void 0, function* () {
                    let filePath;
                    if (fileType) {
                        // Delete from specific subdirectory
                        filePath = path_1.default.join(this.subDirectories[fileType], filename);
                    }
                    else {
                        // Search across all subdirectories (legacy support)
                        const searchPaths = Object.values(this.subDirectories).map(dir => path_1.default.join(dir, filename));
                        filePath = "";
                        for (const searchPath of searchPaths) {
                            try {
                                yield fs_1.default.promises.access(searchPath);
                                filePath = searchPath;
                                break;
                            }
                            catch (err) {
                                // Continue searching
                            }
                        }
                        if (!filePath) {
                            // File not found in any directory, skip
                            return;
                        }
                    }
                    try {
                        yield fs_1.default.promises.access(filePath);
                        yield fs_1.default.promises.unlink(filePath);
                    }
                    catch (err) {
                        if (err.code !== "ENOENT") {
                            throw new AppError_1.InternalServerError(`Failed to delete file: ${filename}`);
                        }
                    }
                })));
            }
            catch (error) {
                throw new AppError_1.InternalServerError("File deletion failed");
            }
        });
        // Legacy method for backward compatibility
        this.deleteImage = (images) => this.deleteFiles(images);
        // Utility method to get file URL
        this.getFileUrl = (filename, fileType) => {
            return `/api/media/${fileType}/${filename}`;
        };
        // Method to process uploaded files and return file info
        this.processUploadedFiles = (files, fileType) => {
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
        this.validateFile = (file, fileType) => {
            const config = this.fileTypeConfig[fileType];
            const isValidExtension = config.allowedTypes.test(path_1.default.extname(file.originalname).toLowerCase());
            const isValidMimeType = config.mimeTypes.includes(file.mimetype);
            const isValidSize = file.size <= config.maxSize;
            return isValidExtension && isValidMimeType && isValidSize;
        };
        // Get file type configuration
        this.getFileTypeConfig = (fileType) => {
            return this.fileTypeConfig[fileType];
        };
        // Create a file info object from filename
        this.createFileInfo = (filename, fileType) => {
            return {
                filename,
                url: this.getFileUrl(filename, fileType)
            };
        };
        try {
            // Create main upload directory
            if (!fs_1.default.existsSync(this.uploadDirectory)) {
                fs_1.default.mkdirSync(this.uploadDirectory, { recursive: true });
            }
            // Create subdirectories for each file type
            Object.values(this.subDirectories).forEach(dir => {
                if (!fs_1.default.existsSync(dir)) {
                    fs_1.default.mkdirSync(dir, { recursive: true });
                }
            });
        }
        catch (error) {
            throw new AppError_1.InternalServerError("Failed to initialize media storage");
        }
    }
};
MediaHandler = __decorate([
    (0, tsyringe_1.injectable)(),
    (0, tsyringe_1.singleton)(),
    __param(0, (0, tsyringe_1.inject)("responseUtils")),
    __metadata("design:paramtypes", [response_utils_1.default])
], MediaHandler);
exports.default = MediaHandler;
