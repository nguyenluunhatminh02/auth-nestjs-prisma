import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/entities/role.entity';
import { RefreshToken } from '../users/entities/refresh-token.entity';
import { LoginHistory } from '../users/entities/login-history.entity';
import { DeviceFingerprint } from '../users/entities/device-fingerprint.entity';
import { SecurityQuestion } from '../users/entities/security-question.entity';

/**
 * Common Entities Module
 * 
 * This module provides shared TypeORM entity registration to avoid circular dependencies
 * between AuthModule and UsersModule. Both modules can import this module to access
 * the required entities without depending on each other.
 * 
 * Usage:
 * - Import this module in any module that needs access to user-related entities
 * - Use TypeOrmModule.forFeature() with the specific entities needed
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Role,
      RefreshToken,
      LoginHistory,
      DeviceFingerprint,
      SecurityQuestion,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class CommonEntitiesModule {}
