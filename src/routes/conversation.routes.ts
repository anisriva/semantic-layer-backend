import { Router } from 'express';
import { ConversationController } from '@/controllers/conversation.controller.js';

const router = Router();
const conversationController = new ConversationController();

// POST /api/v1/conversations - Create a new conversation
router.post('/', conversationController.createConversation.bind(conversationController));

// GET /api/v1/conversations?repositoryId=:id - List conversations for a repository
router.get('/', conversationController.listConversations.bind(conversationController));

// GET /api/v1/conversations/:id/messages - List messages for a conversation
router.get('/:id/messages', conversationController.listMessages.bind(conversationController));

// POST /api/v1/conversations/:id/messages (SSE) - Ask a question, streaming the answer
router.post('/:id/messages', conversationController.streamMessage.bind(conversationController));

export { router as conversationRoutes };
