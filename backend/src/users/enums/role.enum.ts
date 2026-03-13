/**
 * User role enumeration
 * Defines the different roles available in the system
 */
export enum Role {
  /** Administrator with full system access */
  ADMIN = 'ADMIN',

  /** Regular user with standard permissions */
  USER = 'USER',

  /** Moderator with elevated permissions for content management */
  MODERATOR = 'MODERATOR',
}
