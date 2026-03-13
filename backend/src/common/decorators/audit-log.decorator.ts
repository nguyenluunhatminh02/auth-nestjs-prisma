import { SetMetadata } from '@nestjs/common';

/**
 * Audit Log Metadata Key
 * Used to store audit log metadata for decorated methods
 */
export const AUDIT_LOG_KEY = 'audit_log';

/**
 * Audit Log Metadata Interface
 * Defines the structure for audit log metadata
 */
export interface AuditLogMetadata {
  /** Action being performed (e.g., CREATE_USER, UPDATE_USER, DELETE_USER, LOGIN, LOGOUT) */
  action: string;
  
  /** Entity type being affected (e.g., USER, ROLE, REFRESH_TOKEN) */
  entityType: string;
  
  /** ID of the affected entity (if applicable) */
  entityId?: string;
  
  /** Additional description of the operation */
  description?: string;
  
  /** IP address of the request */
  ipAddress?: string;
  
  /** User agent of the request */
  userAgent?: string;
}

/**
 * Audit Log Decorator
 * 
 * Decorator to mark methods for audit logging. When a method is decorated with @AuditLog,
 * metadata is stored that can be used by an AuditService to log the action.
 * 
 * @example
 * @AuditLog({ action: 'UPDATE_USER', entityType: 'USER' })
 * async updateUser(id: string, dto: UpdateUserDto): Promise<User> {
 *   // ... method implementation
 * }
 */
export const AuditLog = (metadata: AuditLogMetadata) =>
  SetMetadata(AUDIT_LOG_KEY, metadata);
