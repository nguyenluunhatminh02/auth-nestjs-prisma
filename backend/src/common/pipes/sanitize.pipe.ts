import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';

/**
 * Sanitize Pipe Options
 * Configuration for HTML sanitization
 */
export interface SanitizeOptions {
  /** Allowed HTML tags (default: empty - no HTML allowed) */
  allowedTags?: string[];
  /** Allowed HTML attributes (default: empty - no attributes allowed) */
  allowedAttributes?: Record<string, string[]>;
  /** Whether to strip disallowed tags instead of escaping (default: true) */
  stripDisallowedTags?: boolean;
  /** Whether to allow protocol-relative URLs (default: false) */
  allowProtocolRelative?: boolean;
}

/**
 * Default sanitization options
 * Removes all HTML tags and attributes by default
 */
const DEFAULT_SANITIZE_OPTIONS: SanitizeOptions = {
  allowedTags: [],
  allowedAttributes: {},
  stripDisallowedTags: true,
  allowProtocolRelative: false,
};

/**
 * Sanitize Pipe
 * 
 * Sanitizes incoming request data to prevent XSS attacks.
 * Removes or escapes HTML tags and attributes based on configuration.
 * 
 * @example
 * // Use with default options (no HTML allowed)
 * @Post()
 * @UsePipes(new SanitizePipe())
 * createPost(@Body() dto: CreatePostDto) {
 *   // dto fields are sanitized
 * }
 * 
 * @example
 * // Use with custom options (allow some HTML)
 * @Post()
 * @UsePipes(new SanitizePipe({
 *   allowedTags: ['b', 'i', 'em', 'strong', 'a'],
 *   allowedAttributes: { a: ['href'] }
 * }))
 * createPost(@Body() dto: CreatePostDto) {
 *   // dto fields are sanitized with custom options
 * }
 */
@Injectable()
export class SanitizePipe implements PipeTransform {
  private readonly logger = new Logger(SanitizePipe.name);
  private readonly options: SanitizeOptions;

  constructor(options?: SanitizeOptions) {
    this.options = { ...DEFAULT_SANITIZE_OPTIONS, ...options };
  }

  transform(value: any, metadata: ArgumentMetadata): any {
    // Skip if value is not an object or is null/undefined
    if (!value || typeof value !== 'object') {
      return value;
    }

    // Skip if this is a file upload
    if (value instanceof File || value instanceof Buffer) {
      return value;
    }

    try {
      return this.sanitizeObject(value, metadata);
    } catch (error) {
      this.logger.error(`Error sanitizing input: ${error.message}`);
      throw new BadRequestException('Invalid input data');
    }
  }

  /**
   * Sanitize an object recursively
   * 
   * @param obj - The object to sanitize
   * @param metadata - The argument metadata
   * @returns The sanitized object
   */
  private sanitizeObject(obj: any, metadata: ArgumentMetadata): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeValue(item, metadata));
    }

    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = this.sanitizeValue(obj[key], metadata);
      }
    }
    return sanitized;
  }

  /**
   * Sanitize a value
   * 
   * @param value - The value to sanitize
   * @param metadata - The argument metadata
   * @returns The sanitized value
   */
  private sanitizeValue(value: any, metadata: ArgumentMetadata): any {
    // Handle strings
    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }

    // Handle objects
    if (typeof value === 'object' && value !== null) {
      return this.sanitizeObject(value, metadata);
    }

    // Return other types as-is
    return value;
  }

  /**
   * Sanitize a string
   * 
   * @param str - The string to sanitize
   * @returns The sanitized string
   */
  private sanitizeString(str: string): string {
    return sanitizeHtml(str, {
      allowedTags: this.options.allowedTags || [],
      allowedAttributes: this.options.allowedAttributes || {},
      allowProtocolRelative: this.options.allowProtocolRelative || false,
    });
  }
}

/**
 * Strict Sanitize Pipe
 * 
 * A pre-configured pipe with strict sanitization (no HTML allowed).
 * Use this for most user inputs to prevent XSS attacks.
 */
export class StrictSanitizePipe extends SanitizePipe {
  constructor() {
    super({
      allowedTags: [],
      allowedAttributes: {},
      allowProtocolRelative: false,
    });
  }
}

/**
 * Rich Text Sanitize Pipe
 * 
 * A pre-configured pipe that allows basic rich text formatting.
 * Use this for fields that allow basic HTML formatting (like post content).
 */
export class RichTextSanitizePipe extends SanitizePipe {
  constructor() {
    super({
      allowedTags: [
        'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code',
        'pre', 'hr', 'sub', 'sup', 'del', 'ins'
      ],
      allowedAttributes: {
        a: ['href', 'title', 'target'],
      },
      allowProtocolRelative: false,
    });
  }
}
