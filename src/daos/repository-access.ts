import { prisma } from '@/connectors/database.js';
import type { RepositoryAccess, RepositoryPermission } from '@prisma/client';

export class RepositoryAccessDao {
  /**
   * Grants access to a repository for a user.
   */
  async grantAccess(data: {
    repositoryId: string;
    userId: string;
    permission: RepositoryPermission;
    grantedBy?: string;
  }): Promise<RepositoryAccess> {
    return prisma.repositoryAccess.create({
      data: {
        repository_id: data.repositoryId,
        user_id: data.userId,
        permission: data.permission,
        granted_by: data.grantedBy,
      },
    });
  }

  /**
   * Finds access record for a specific user and repository.
   */
  async findByUserAndRepository(
    userId: string,
    repositoryId: string,
  ): Promise<RepositoryAccess | null> {
    return prisma.repositoryAccess.findUnique({
      where: {
        repository_id_user_id: {
          repository_id: repositoryId,
          user_id: userId,
        },
      },
    });
  }

  /**
   * Lists all users with access to a repository.
   */
  async listByRepository(repositoryId: string): Promise<RepositoryAccess[]> {
    return prisma.repositoryAccess.findMany({
      where: { repository_id: repositoryId },
      include: {
        user: true,
      },
    });
  }

  /**
   * Lists all repositories a user has access to.
   */
  async listByUser(userId: string): Promise<RepositoryAccess[]> {
    return prisma.repositoryAccess.findMany({
      where: { user_id: userId },
      include: {
        repository: {
          include: {
            owner: true,
          },
        },
      },
    });
  }

  /**
   * Updates access permission.
   */
  async updatePermission(
    id: string,
    permission: RepositoryPermission,
  ): Promise<RepositoryAccess> {
    return prisma.repositoryAccess.update({
      where: { id },
      data: { permission },
    });
  }

  /**
   * Revokes access to a repository.
   */
  async revokeAccess(id: string): Promise<RepositoryAccess> {
    return prisma.repositoryAccess.delete({
      where: { id },
    });
  }
}
