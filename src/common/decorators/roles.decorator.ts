import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../users/user.entity';

export const ROLES_KEY = 'roles';

/**
 * Помечает обработчик (или весь контроллер) списком глобальных ролей,
 * которым он доступен. Проверяет RolesGuard.
 * Пример: @Roles(UserRole.ADMIN)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
