import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

/**
 * Predefined security questions
 */
export const PREDEFINED_SECURITY_QUESTIONS = [
  'What was the name of your first pet?',
  'What is your mother\'s maiden name?',
  'What was the name of your elementary school?',
  'What city were you born in?',
  'What is your favorite movie?',
  'What is your favorite food?',
  'What was your first car?',
  'What is the name of your childhood best friend?',
  'What is your favorite book?',
  'What is your dream job?',
];

/**
 * Security Question Data
 */
export interface SecurityQuestionData {
  /** The question text */
  question: string;
  /** The user's answer (will be hashed) */
  answer: string;
  /** Sort order for multiple questions */
  sortOrder?: number;
}

/**
 * Security Question Service
 * 
 * Manages security questions for account recovery and verification.
 * Provides predefined questions and answer hashing.
 */
@Injectable()
export class SecurityQuestionService {
  private readonly logger = new Logger(SecurityQuestionService.name);

  /**
   * Get all predefined security questions
   * 
   * @returns Array of predefined security questions
   */
  getPredefinedQuestions(): string[] {
    return [...PREDEFINED_SECURITY_QUESTIONS];
  }

  /**
   * Get a random security question
   * 
   * @returns A random security question
   */
  getRandomQuestion(): string {
    const questions = this.getPredefinedQuestions();
    const randomIndex = Math.floor(Math.random() * questions.length);
    return questions[randomIndex];
  }

  /**
   * Get multiple random security questions
   * 
   * @param count - Number of questions to return
   * @returns Array of random security questions
   */
  getRandomQuestions(count: number): string[] {
    const questions = this.getPredefinedQuestions();
    const shuffled = [...questions].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, questions.length));
  }

  /**
   * Hash a security question answer
   * 
   * @param answer - The answer to hash
   * @param salt - Optional salt for hashing (default: empty)
   * @returns The hashed answer
   */
  hashAnswer(answer: string, salt: string = ''): string {
    // Normalize answer: lowercase, trim, remove extra spaces
    const normalized = answer.toLowerCase().trim().replace(/\s+/g, ' ');
    
    // Create hash with salt
    return createHash('sha256')
      .update(normalized + salt)
      .digest('hex');
  }

  /**
   * Validate a security question answer
   * 
   * @param answer - The user's answer
   * @param hashedAnswer - The stored hashed answer
   * @param salt - Optional salt used for hashing (default: empty)
   * @returns True if the answer matches
   */
  validateAnswer(
    answer: string,
    hashedAnswer: string,
    salt: string = '',
  ): boolean {
    const hashedInput = this.hashAnswer(answer, salt);
    return hashedInput === hashedAnswer;
  }

  /**
   * Check if a question is valid
   * 
   * @param question - The question to validate
   * @returns True if the question is valid
   */
  isValidQuestion(question: string): boolean {
    if (!question || question.trim().length === 0) {
      return false;
    }

    if (question.length < 10 || question.length > 500) {
      return false;
    }

    // Check if question is in predefined list (optional)
    // return PREDEFINED_SECURITY_QUESTIONS.includes(question);

    return true;
  }

  /**
   * Check if an answer is valid
   * 
   * @param answer - The answer to validate
   * @returns True if the answer is valid
   */
  isValidAnswer(answer: string): boolean {
    if (!answer || answer.trim().length === 0) {
      return false;
    }

    if (answer.length < 2 || answer.length > 255) {
      return false;
    }

    return true;
  }

  /**
   * Normalize a question
   * 
   * @param question - The question to normalize
   * @returns The normalized question
   */
  normalizeQuestion(question: string): string {
    return question.trim().replace(/\s+/g, ' ');
  }

  /**
   * Normalize an answer
   * 
   * @param answer - The answer to normalize
   * @returns The normalized answer
   */
  normalizeAnswer(answer: string): string {
    return answer.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Generate a salt for answer hashing
   * 
   * @returns A random salt
   */
  generateSalt(): string {
    return Math.random().toString(36).substring(2, 15) +
           Date.now().toString(36);
  }

  /**
   * Create security question data with hashed answer
   * 
   * @param question - The question
   * @param answer - The answer
   * @param sortOrder - Optional sort order
   * @returns Security question data with hashed answer
   */
  createSecurityQuestionData(
    question: string,
    answer: string,
    sortOrder?: number,
  ): SecurityQuestionData {
    // Validate question and answer
    if (!this.isValidQuestion(question)) {
      throw new Error('Invalid security question');
    }

    if (!this.isValidAnswer(answer)) {
      throw new Error('Invalid security answer');
    }

    // Generate salt and hash answer
    const salt = this.generateSalt();
    const hashedAnswer = this.hashAnswer(answer, salt);

    return {
      question: this.normalizeQuestion(question),
      answer: hashedAnswer,
      sortOrder,
    };
  }

  /**
   * Compare two answers for similarity
   * 
   * @param answer1 - First answer
   * @param answer2 - Second answer
   * @returns True if answers are similar (case-insensitive)
   */
  compareAnswers(answer1: string, answer2: string): boolean {
    const normalized1 = this.normalizeAnswer(answer1);
    const normalized2 = this.normalizeAnswer(answer2);
    return normalized1 === normalized2;
  }

  /**
   * Get recommended number of security questions
   * 
   * @returns Recommended number of questions
   */
  getRecommendedQuestionCount(): number {
    return 3;
  }

  /**
   * Get minimum number of security questions required
   * 
   * @returns Minimum required questions
   */
  getMinimumQuestionCount(): number {
    return 1;
  }

  /**
   * Get maximum number of security questions allowed
   * 
   * @returns Maximum allowed questions
   */
  getMaximumQuestionCount(): number {
    return 5;
  }
}
