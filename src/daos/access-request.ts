import { prisma } from '@/connectors/database.js';
import type { AccessRequest, AccessRequestStatus } from '@prisma/client';

export class AccessRequestDao {
  /**
   * Creates a new access request.
   */
  async create(data: {
    repositoryId: string;
    userId: string;
  }): Promise<AccessRequest> {
    return prisma.accessRequest.create({
      data: {
        repository_id: data.repositoryId,
        user_id: data.userId,
        status: 'PENDING',
      },
    });
  }

  /**
   * Finds an access request by ID.
   */
  async findById(id: string): Promise<AccessRequest | null> {
    return prisma.accessRequest.findUnique({
      where: { id },
      include: {
        repository: {
          include: {
            owner: true,
          },
        },
        user: true,
      },
    });
  }

  /**
   * Lists access requests for a repository.
   */
  async listByRepository(
    repositoryId: string,
    status?: AccessRequestStatus,
  ): Promise<AccessRequest[]> {
    const where: any = { repository_id: repositoryId };
    if (status) {
      where.status = status;
    }

    return prisma.accessRequest.findMany({
      where,
      include: {
        user: true,
      },
      orderBy: { requested_at: 'desc' },
    });
  }

  /**
   * Lists access requests for a user.
   */
  async listByUser(
    userId: string,
    status?: AccessRequestStatus,
  ): Promise<AccessRequest[]> {
    const where: any = { user_id: userId };
    if (status) {
      where.status = status;
    }

    return prisma.accessRequest.findMany({
      where,
      include: {
        repository: {
          include: {
            owner: true,
          },
        },
      },
      orderBy: { requested_at: 'desc' },
    });
  }

  /**
   * Responds to an access request (approve or reject).
   */
  async respond(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    respondedBy: string,
    responseMessage?: string,
  ): Promise<AccessRequest> {
    return prisma.accessRequest.update({
      where: { id },
      data: {
        status,
        responded_at: new Date(),
        responded_by: respondedBy,
        response_message: responseMessage,
      },
    });
  }

  /**
   * Deletes an access request.
   */
  async delete(id: string): Promise<AccessRequest> {
    return prisma.accessRequest.delete({
      where: { id },
    });
  }
}
