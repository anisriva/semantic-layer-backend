import { Request, Response, NextFunction } from "express";
import { ConversationService } from "@/services/conversation.js";
import { UserDao } from "@/daos/index.js";
import { ChatGenerationError } from "@/services/chat.js";
import { NotIndexedError, SearchError } from "@/services/search.js";
import type {
  ApiResponse,
  ApiPaginatedResponse,
} from "@/types/common/index.js";
import type {
  ConversationWithDetails,
  MessageWithConversation,
} from "@/services/conversation.js";
import { ZodError } from "zod";
import {
  createConversationSchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  streamMessageSchema,
} from "@/schemas/conversation/index.js";

export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService = new ConversationService(),
    private readonly userDao: UserDao = new UserDao(),
  ) {}

  /**
   * POST /api/v1/conversations
   * Creates a new repository-scoped conversation.
   *
   * There is no authentication in the MVP (architecture Section 2), so the
   * conversation is attributed to the MVP service user rather than a
   * request-supplied `userId`.
   */
  async createConversation(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<Response<ApiResponse<ConversationWithDetails>>> {
    try {
      const validatedData = createConversationSchema.parse(req.body ?? {});
      const serviceUser = await this.userDao.getOrCreateServiceUser();
      const conversation = await this.conversationService.createConversation({
        repositoryId: validatedData.repositoryId,
        userId: serviceUser.id,
        title: validatedData.title,
      });

      return res.status(201).json({ success: true, data: conversation });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: "Validation error",
          details: error.issues,
        });
      }
      if (error instanceof Error && error.message === "Repository not found") {
        return res.status(404).json({ success: false, error: error.message });
      }
      next(error);
      return res
        .status(500)
        .json({ success: false, error: "Internal server error" });
    }
  }

  /**
   * GET /api/v1/conversations?repositoryId=:id
   * Lists conversations, scoped to a repository (Section 14: "no
   * cross-repository retrieval in MVP").
   */
  async listConversations(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<Response<ApiPaginatedResponse<ConversationWithDetails>>> {
    try {
      const validatedQuery = listConversationsQuerySchema.parse(req.query);
      const conversations = await this.conversationService.listConversations(
        validatedQuery.repositoryId,
        {
          limit: validatedQuery.limit,
          offset: validatedQuery.offset,
        },
      );

      return res.json({
        success: true,
        data: conversations,
        meta: {
          total: conversations.length,
          limit: validatedQuery.limit ?? conversations.length,
          offset: validatedQuery.offset ?? 0,
        },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: "Validation error",
          details: error.issues,
        });
      }
      next(error);
      return res
        .status(500)
        .json({ success: false, error: "Internal server error" });
    }
  }

  /**
   * GET /api/v1/conversations/:id/messages
   * Lists messages for a conversation.
   */
  async listMessages(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<Response<ApiPaginatedResponse<MessageWithConversation>>> {
    try {
      const { id } = req.params;
      if (!id) {
        return res
          .status(400)
          .json({ success: false, error: "Conversation ID is required" });
      }
      const conversationId: string = id as string;

      const conversation =
        await this.conversationService.getConversation(conversationId);
      if (!conversation) {
        return res
          .status(404)
          .json({ success: false, error: "Conversation not found" });
      }

      const validatedQuery = listMessagesQuerySchema.parse(req.query);
      const messages = await this.conversationService.listMessages(
        conversationId,
        {
          limit: validatedQuery.limit,
          offset: validatedQuery.offset,
        },
      );

      return res.json({
        success: true,
        data: messages,
        meta: {
          total: messages.length,
          limit: validatedQuery.limit ?? messages.length,
          offset: validatedQuery.offset ?? 0,
        },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: "Validation error",
          details: error.issues,
        });
      }
      next(error);
      return res
        .status(500)
        .json({ success: false, error: "Internal server error" });
    }
  }

  /**
   * POST /api/v1/conversations/:id/messages (SSE)
   *
   * Persists the user message immediately, streams the LLM answer
   * token-by-token as `event: message` / `data: { chunk }` frames, and
   * persists the complete assistant message once streaming ends
   * (architecture Section 14). Closes with `event: done` on success, or
   * `event: error` (before persisting a message that never started) if
   * retrieval/generation fails.
   *
   * Retrieval is scoped to the conversation's repository via the same
   * per-repository Qdrant collection naming the worker uses
   * (`repo-<repositoryId>`, `src/worker.ts`) — there is no additional
   * filter needed at the query layer for repository isolation (Section 11.1).
   */
  async streamMessage(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id: rawId } = req.params;
      if (!rawId) {
        res.status(400).json({ error: "Conversation ID is required" });
        return;
      }
      const conversationId: string = rawId as string;
      const validatedData = streamMessageSchema.parse(req.body ?? {});

      const conversation =
        await this.conversationService.getConversation(conversationId);
      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }

      if (!conversation.repository) {
        res
          .status(404)
          .json({ error: "Repository not found for conversation" });
        return;
      }

      const collectionName = `repo-${conversation.repository.id}`;

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      let clientDisconnected = false;
      req.on("close", () => {
        clientDisconnected = true;
      });

      try {
        for await (const chunk of this.conversationService.askQuestionStream(
          conversationId,
          validatedData.content,
          collectionName,
        )) {
          if (clientDisconnected) break;
          res.write(`event: message\ndata: ${JSON.stringify({ chunk })}\n\n`);
        }
        if (!clientDisconnected) {
          res.write(`event: done\ndata: ${JSON.stringify({ done: true })}\n\n`);
        }
      } catch (error) {
        const message = this.describeStreamingError(error);
        if (!clientDisconnected) {
          res.write(
            `event: error\ndata: ${JSON.stringify({ error: message })}\n\n`,
          );
        }
      } finally {
        res.end();
      }
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: "Validation error",
          details: error.issues,
        });
        return;
      }
      next(error);
    }
  }

  private describeStreamingError(error: unknown): string {
    if (
      error instanceof NotIndexedError ||
      error instanceof SearchError ||
      error instanceof ChatGenerationError
    ) {
      return error.message;
    }
    return "Failed to generate an answer";
  }
}
