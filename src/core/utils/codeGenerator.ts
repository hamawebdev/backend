import crypto from 'crypto';

/**
 * Generate a secure activation code
 * @param length Length of the code to generate
 * @returns Secure random code
 */
export function generateSecureCode(length: number = 12): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  // Use crypto.randomBytes for cryptographically secure random generation
  const randomBytes = crypto.randomBytes(length);
  
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
export function generateFormattedCode(
  segments: number = 3,
  segmentLength: number = 4,
  separator: string = '-'
): string {
  const codeSegments: string[] = [];
  
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
export function validateCodeFormat(code: string): boolean {
  // Allow alphanumeric codes with optional hyphens
  const codeRegex = /^[A-Z0-9-]+$/;
  return codeRegex.test(code) && code.length >= 8 && code.length <= 32;
}
