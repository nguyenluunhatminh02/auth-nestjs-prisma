import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Password History Service
 * 
 * Manages password history to prevent password reuse.
 * Users cannot reuse their last N passwords.
 */
@Injectable()
export class PasswordHistoryService {
  private readonly logger = new Logger(PasswordHistoryService.name);
  private readonly HISTORY_LIMIT: number;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.HISTORY_LIMIT = this.config.get<number>('PASSWORD_HISTORY_LIMIT', 5);
  }

  /**
   * Check if a password has been used before
   * 
   * @param userId - The user ID to check
   * @param newPassword - The new password to check
   * @returns True if the password has been used before, false otherwise
   */
  async isPasswordReused(userId: string, newPassword: string): Promise<boolean> {
    try {
      // Get user's password history
      const history = await this.getPasswordHistory(userId);

      // Check if new password matches any in history
      for (const entry of history) {
        const isMatch = await bcrypt.compare(newPassword, entry.password_hash);
        if (isMatch) {
          this.logger.warn(`User ${userId} attempted to reuse a previous password`);
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error(`Error checking password history: ${error.message}`);
      // Fail-CLOSED: if we cannot check history, block the password change rather
      // than silently allowing potential reuse (security > availability here).
      throw error;
    }
  }

  /**
   * Add a password to the user's history
   * 
   * @param userId - The user ID
   * @param passwordHash - The hashed password to add
   */
  async addPasswordToHistory(userId: string, passwordHash: string): Promise<void> {
    try {
      // Add new password to history
      await this.prisma.password_history.create({
        data: {
          user_id: userId,
          password_hash: passwordHash,
          created_at: new Date(),
        },
      });

      // Clean up old passwords if we exceed the limit
      await this.cleanupOldPasswords(userId);
    } catch (error) {
      this.logger.error(`Error adding password to history: ${error.message}`);
      // Don't throw error to prevent blocking password change
    }
  }

  /**
   * Get user's password history
   * 
   * @param userId - The user ID
   * @returns Array of password history entries
   */
  async getPasswordHistory(userId: string): Promise<any[]> {
    try {
      return await this.prisma.password_history.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        take: this.HISTORY_LIMIT,
      });
    } catch (error) {
      this.logger.error(`Error getting password history: ${error.message}`);
      return [];
    }
  }

  /**
   * Clear all password history for a user
   * 
   * @param userId - The user ID
   */
  async clearPasswordHistory(userId: string): Promise<void> {
    try {
      await this.prisma.password_history.deleteMany({
        where: { user_id: userId },
      });
    } catch (error) {
      this.logger.error(`Error clearing password history: ${error.message}`);
    }
  }

  /**
   * Clean up old passwords beyond the history limit
   * 
   * @param userId - The user ID
   */
  private async cleanupOldPasswords(userId: string): Promise<void> {
    try {
      const count = await this.prisma.password_history.count({
        where: { user_id: userId },
      });

      if (count > this.HISTORY_LIMIT) {
        const keepIds = await this.prisma.password_history.findMany({
          where: { user_id: userId },
          orderBy: { created_at: 'desc' },
          select: { id: true },
          take: this.HISTORY_LIMIT,
        });

        const keepIdSet = new Set(keepIds.map(h => h.id));

        await this.prisma.password_history.deleteMany({
          where: {
            user_id: userId,
            id: { notIn: [...keepIdSet] },
          },
        });
      }
    } catch (error) {
      this.logger.error(`Error cleaning up old passwords: ${error.message}`);
    }
  }
}
