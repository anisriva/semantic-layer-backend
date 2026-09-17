import { prisma } from '@/connectors/database.js';
import type { Conversation } from '@prisma/client';

export class ConversationDao {
  /**
   * Creates a new conversation.
   */
  async create(data: {
    repositoryId: string;
    userId: string;
    title?: string;
  }): Promise<Conversation> {
    return prisma.conversation.create({
      data: {
        repository_id: data.repositoryId,
        user_id: data.userId,
        title: data.title,
      },
    });
  }

  /**
   * Finds a conversation by ID.
   */
  async findById(id: string): Promise<Conversation | null> {
    return prisma.conversation.findUnique({
      where: { id },
      include: {
        repository: {
          include: {
            owner: true,
          },
        },
        user: true,
        messages: {
          orderBy: { created_at: 'asc' },
        },
      },
    });
  }

  /**
   * Lists conversations for a repository.
   */
  async listByRepository(
    repositoryId: string,
    options?: {
      userId?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<Conversation[]> {
    const where: any = { repository_id: repositoryId };
    if (options?.userId) {
      where.user_id = options.userId;
    }

    return prisma.conversation.findMany({
      where,
      include: {
        user: true,
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { updated_at: 'desc' },
      take: options?.limit,
      skip: options?.offset,
    });
  }

  /**
   * Lists conversations for a user.
   */
  async listByUser(
    userId: string,
    options?: {
      repositoryId?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<Conversation[]> {
    const where: any = { user_id: userId };
    if (options?.repositoryId) {
      where.repository_id = options.repositoryId;
    }

    return prisma.conversation.findMany({
      where,
      include: {
        repository: {
          include: {
            owner: true,
          },
        },
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { updated_at: 'desc' },
      take: options?.limit,
      skip: options?.offset,
    });
  }

  /**
   * Updates conversation title.
   */
  async updateTitle(id: string, title: string): Promise<Conversation> {
    return prisma.conversation.update({
      where: { id },
      data: { title },
    });
  }

  /**
   * Updates the updated_at timestamp (called when messages are added).
   */
  async touch(id: string): Promise<Conversation> {
    return prisma.conversation.update({
      where: { id },
      data: { updated_at: new Date() },
    });
  }

  /**
   * Deletes a conversation.
   */
  async delete(id: string): Promise<Conversation> {
    return prisma.conversation.delete({
      where: { id },
    });
  }
}
