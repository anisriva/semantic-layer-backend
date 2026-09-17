import { ConversationDao, MessageDao, RepositoryDao, AuditLogDao } from '@/daos/index.js';
import { ChatService, type ChatAnswer } from '@/services/chat.js';
import type { Conversation, Message, MessageRole } from '@prisma/client';

export interface CreateConversationData {
  repositoryId: string;
  userId: string;
  title?: string;
}

export interface CreateMessageData {
  conversationId: string;
  role: MessageRole;
  content: string;
}

export interface ConversationWithDetails extends Conversation {
  repository: {
    id: string;
    git_url: string;
    name: string;
    status: string;
  };
  user: {
    id: string;
    email: string;
    name: string;
  };
  messages: Message[];
}

export interface MessageWithConversation extends Message {
  conversation: {
    id: string;
    repository_id: string;
    user_id: string;
  };
}

export class ConversationService {
  constructor(
    private readonly conversationDao: ConversationDao = new ConversationDao(),
    private readonly messageDao: MessageDao = new MessageDao(),
    private readonly repositoryDao: RepositoryDao = new RepositoryDao(),
    private readonly chatService: ChatService = new ChatService(),
    private readonly auditLogDao: AuditLogDao = new AuditLogDao(),
  ) {}

  /**
   * Creates a new conversation.
   */
  async createConversation(data: CreateConversationData): Promise<ConversationWithDetails> {
    // Verify repository exists
    const repository = await this.repositoryDao.findById(data.repositoryId);
    if (!repository) {
      throw new Error('Repository not found');
    }

    const conversation = await this.conversationDao.create(data);
    const conversationWithDetails = await this.conversationDao.findById(conversation.id);
    if (!conversationWithDetails) {
      throw new Error('Failed to retrieve created conversation');
    }
    return conversationWithDetails as ConversationWithDetails;
  }

  /**
   * Gets a conversation by ID.
   */
  async getConversation(id: string): Promise<ConversationWithDetails | null> {
    const conversation = await this.conversationDao.findById(id);
    return conversation as ConversationWithDetails | null;
  }

  /**
   * Lists conversations for a repository.
   */
  async listConversations(
    repositoryId: string,
    options?: {
      userId?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<ConversationWithDetails[]> {
    const conversations = await this.conversationDao.listByRepository(repositoryId, options);
    return conversations as ConversationWithDetails[];
  }

  /**
   * Lists conversations for a user.
   */
  async listUserConversations(
    userId: string,
    options?: {
      repositoryId?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<ConversationWithDetails[]> {
    const conversations = await this.conversationDao.listByUser(userId, options);
    return conversations as ConversationWithDetails[];
  }

  /**
   * Updates conversation title.
   */
  async updateConversationTitle(id: string, title: string): Promise<ConversationWithDetails> {
    await this.conversationDao.updateTitle(id, title);
    const conversation = await this.conversationDao.findById(id);
    if (!conversation) {
      throw new Error('Failed to retrieve updated conversation');
    }
    return conversation as ConversationWithDetails;
  }

  /**
   * Deletes a conversation.
   */
  async deleteConversation(id: string): Promise<ConversationWithDetails> {
    const conversation = await this.conversationDao.findById(id);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    await this.conversationDao.delete(id);
    return conversation as ConversationWithDetails;
  }

  /**
   * Adds a user message to a conversation.
   */
  async addUserMessage(data: CreateMessageData): Promise<MessageWithConversation> {
    const message = await this.messageDao.create(data);
    const messageWithDetails = await this.messageDao.findById(message.id);
    if (!messageWithDetails) {
      throw new Error('Failed to retrieve created message');
    }
    return messageWithDetails as MessageWithConversation;
  }

  /**
   * Adds an assistant message to a conversation.
   */
  async addAssistantMessage(data: CreateMessageData): Promise<MessageWithConversation> {
    const message = await this.messageDao.create(data);
    const messageWithDetails = await this.messageDao.findById(message.id);
    if (!messageWithDetails) {
      throw new Error('Failed to retrieve created message');
    }
    return messageWithDetails as MessageWithConversation;
  }

  /**
   * Lists messages for a conversation.
   */
  async listMessages(
    conversationId: string,
    options?: {
      limit?: number;
      offset?: number;
    },
  ): Promise<Message[]> {
    return this.messageDao.listByConversation(conversationId, options);
  }

  /**
   * Asks a question in a conversation context.
   * This wraps ChatService.ask and persists both the user message and assistant response.
   */
  async askQuestion(
    conversationId: string,
    question: string,
    collectionName: string,
  ): Promise<{
    userMessage: MessageWithConversation;
    assistantMessage: MessageWithConversation;
    answer: ChatAnswer;
  }> {
    // Get conversation to verify it exists and get repository info
    const conversation = await this.conversationDao.findById(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Persist user message immediately
    const userMessage = await this.addUserMessage({
      conversationId,
      role: 'user',
      content: question,
    });

    // Generate answer using ChatService, attributing the CHAT audit trail
    // (RETRIEVAL / CHAT_COMPLETION) to this conversation and user message.
    let answer: ChatAnswer;
    try {
      answer = await this.chatService.ask(collectionName, question, {
        conversationId,
        messageId: userMessage.id,
        userId: conversation.user_id,
        auditLogDao: this.auditLogDao,
      });
    } catch (error) {
      // If chat fails, still persist the user message but throw the error
      throw error;
    }

    // Persist assistant message
    const assistantMessage = await this.addAssistantMessage({
      conversationId,
      role: 'assistant',
      content: answer.answer,
    });

    return {
      userMessage: userMessage as MessageWithConversation,
      assistantMessage: assistantMessage as MessageWithConversation,
      answer,
    };
  }

  /**
   * Streaming counterpart to `askQuestion`, driving the SSE conversation
   * endpoint (architecture Section 14):
   *
   * 1. Persists the user message immediately.
   * 2. Yields answer text deltas as `ChatService.askStream` produces them.
   * 3. Persists the complete assistant message once streaming ends —
   *    including a partial answer if the stream fails partway through, so
   *    "complete messages are always persisted regardless of streaming
   *    success" (Section 14) holds even on error.
   *
   * @throws {Error} if the conversation does not exist.
   * @throws the underlying `NotIndexedError`/`SearchError`/`ChatGenerationError`
   * from `ChatService.askStream` unchanged, after persisting whatever
   * partial answer (if any) was generated before the failure.
   */
  async *askQuestionStream(
    conversationId: string,
    question: string,
    collectionName: string,
  ): AsyncGenerator<string, void, unknown> {
    const conversation = await this.conversationDao.findById(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Persist user message immediately
    const userMessage = await this.addUserMessage({
      conversationId,
      role: 'user',
      content: question,
    });

    const { textStream } = await this.chatService.askStream(collectionName, question, {
      conversationId,
      messageId: userMessage.id,
      userId: conversation.user_id,
      auditLogDao: this.auditLogDao,
    });

    let fullAnswer = '';
    try {
      for await (const chunk of textStream) {
        fullAnswer += chunk;
        yield chunk;
      }
    } finally {
      if (fullAnswer.length > 0) {
        await this.addAssistantMessage({
          conversationId,
          role: 'assistant',
          content: fullAnswer,
        });
      }
    }
  }

  /**
   * Updates message content.
   */
  async updateMessage(id: string, content: string): Promise<MessageWithConversation> {
    await this.messageDao.updateContent(id, content);
    const message = await this.messageDao.findById(id);
    if (!message) {
      throw new Error('Failed to retrieve updated message');
    }
    return message as MessageWithConversation;
  }

  /**
   * Deletes a message.
   */
  async deleteMessage(id: string): Promise<MessageWithConversation> {
    const message = await this.messageDao.findById(id);
    if (!message) {
      throw new Error('Message not found');
    }

    await this.messageDao.delete(id);
    return message as MessageWithConversation;
  }
}
