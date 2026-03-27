import { SetMetadata } from '@nestjs/common';
import { Role } from '../../users/enums/role.enum';

/**
 * Roles Decorator
 * 
 * Specify which roles are allowed to access a route.
 * Multiple roles can be specified - user must have at least one of them.
 * 
 * @example
 * // Only admins can access
 * @Roles(Role.ADMIN)
 * async adminOnlyEndpoint() { ... }
 * 
 * @example
 * // Admins or moderators can access
 * @Roles(Role.ADMIN, Role.MODERATOR)
 * async adminOrModeratorEndpoint() { ... }
 */
export const ROLES_KEY = 'roles';

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const PUBLIC_KEY = 'isPublic';

