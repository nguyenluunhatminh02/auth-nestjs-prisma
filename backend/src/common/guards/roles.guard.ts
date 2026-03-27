import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ROLES_KEY, PUBLIC_KEY } from '../decorators/roles.decorator';
import { Reflector } from '@nestjs/core';
import { Role } from '../../users/enums/role.enum';

/**
 * Roles Guard
 * 
 * Enforces role-based access control (RBAC) on routes decorated with @Roles().
 * User must have at least one of the required roles to access the route.
 * 
 * Routes decorated with @Public() are exempt from role checking.
 * 
 * @example
 * // In controller
 * @Get('admin-only')
 * @Roles(Role.ADMIN)
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * async adminOnlyEndpoint() { ... }
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Get required roles from decorator
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles specified, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Get user from request
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Check if user exists
    if (!user) {
      this.logger.warn('No user found in request for protected route');
      throw new ForbiddenException('Access denied');
    }

    // Get user roles
    const userRoles = this.getUserRoles(user);

    // Check if user has at least one required role
    const hasRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      this.logger.warn(
        `User ${user.id} with roles [${userRoles.join(', ')}] attempted to access route requiring [${requiredRoles.join(', ')}]`,
      );
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }

  /**
   * Extract user roles from user object
   */
  private getUserRoles(user: any): Role[] {
    // Handle different user object structures
    if (user.roles && Array.isArray(user.roles)) {
      // If roles is an array of role objects
      if (user.roles.length > 0 && typeof user.roles[0] === 'object') {
        return user.roles.map((r: any) => r.name || r);
      }
      // If roles is an array of role names
      return user.roles;
    }

    // Handle single role property
    if (user.role) {
      return [user.role];
    }

    // Default to user role if no roles found
    this.logger.warn(`No roles found for user ${user.id}, defaulting to USER`);
    return [Role.USER];
  }
}
