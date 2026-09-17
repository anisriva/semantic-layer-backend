import { prisma } from '@/connectors/database.js';
import type { User, UserRole } from '@prisma/client';

export class UserDao {
  /**
   * Finds a user by email.
   */
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Finds a user by ID.
   */
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  /**
   * Creates a new user.
   */
  async create(data: {
    email: string;
    name: string;
    role?: UserRole;
  }): Promise<User> {
    return prisma.user.create({
      data,
    });
  }

  /**
   * Gets or creates the MVP service user.
   */
  async getOrCreateServiceUser(): Promise<User> {
    const existing = await this.findByEmail('service@semantic-layer.local');
    if (existing) {
      return existing;
    }

    return this.create({
      email: 'service@semantic-layer.local',
      name: 'Service User',
      role: 'ADMIN',
    });
  }
}
