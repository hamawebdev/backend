"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSecureCode = generateSecureCode;
exports.generateFormattedCode = generateFormattedCode;
exports.validateCodeFormat = validateCodeFormat;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Generate a secure activation code
 * @param length Length of the code to generate
 * @returns Secure random code
 */
function generateSecureCode(length = 12) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    // Use crypto.randomBytes for cryptographically secure random generation
    const randomBytes = crypto_1.default.randomBytes(length);
    for (let i = 0; i < length; i++) {
        result += characters.charAt(randomBytes[i] % characters.length);
    }
    return result;
}
/**
 * Generate a secure activation code with specific format
 * @param segments Number of segments (default: 3)
 * @param segmentLength Length of each segment (default: 4)
 * @param separator Separator between segments (default: '-')
 * @returns Formatted secure code (e.g., "ABCD-EFGH-IJKL")
 */
function generateFormattedCode(segments = 3, segmentLength = 4, separator = '-') {
    const codeSegments = [];
    for (let i = 0; i < segments; i++) {
        codeSegments.push(generateSecureCode(segmentLength));
    }
    return codeSegments.join(separator);
}
/**
 * Validate activation code format
 * @param code Code to validate
 * @returns True if code format is valid
 */
function validateCodeFormat(code) {
    // Allow alphanumeric codes with optional hyphens
    const codeRegex = /^[A-Z0-9-]+$/;
    return codeRegex.test(code) && code.length >= 8 && code.length <= 32;
}
