import { prisma } from '@/connectors/database.js';
import type { Message, MessageRole } from '@prisma/client';

export class MessageDao {
  /**
   * Creates a new message.
   */
  async create(data: {
    conversationId: string;
    role: MessageRole;
    content: string;
  }): Promise<Message> {
    const message = await prisma.message.create({
      data: {
        conversation_id: data.conversationId,
        role: data.role,
        content: data.content,
      },
    });

    // Update conversation's updated_at timestamp
    await prisma.conversation.update({
      where: { id: data.conversationId },
      data: { updated_at: new Date() },
    });

    return message;
  }

  /**
   * Finds a message by ID.
   */
  async findById(id: string): Promise<Message | null> {
    return prisma.message.findUnique({
      where: { id },
      include: {
        conversation: {
          include: {
            repository: true,
            user: true,
          },
        },
      },
    });
  }

  /**
   * Lists messages for a conversation.
   */
  async listByConversation(
    conversationId: string,
    options?: {
      limit?: number;
      offset?: number;
    },
  ): Promise<Message[]> {
    return prisma.message.findMany({
      where: { conversation_id: conversationId },
      orderBy: { created_at: 'asc' },
      take: options?.limit,
      skip: options?.offset,
    });
  }

  /**
   * Updates message content.
   */
  async updateContent(id: string, content: string): Promise<Message> {
    return prisma.message.update({
      where: { id },
      data: { content },
    });
  }

  /**
   * Deletes a message.
   */
  async delete(id: string): Promise<Message> {
    return prisma.message.delete({
      where: { id },
    });
  }

  /**
   * Deletes all messages for a conversation.
   */
  async deleteByConversation(conversationId: string): Promise<number> {
    const result = await prisma.message.deleteMany({
      where: { conversation_id: conversationId },
    });
    return result.count;
  }
}
