import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

/**
 * Admin Router - User Management and Analytics
 * Requires admin role for all procedures
 */

const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only administrators can access this resource",
    });
  }
  return next({ ctx });
});

export const adminRouter = router({
  // Get all users with pagination and filtering
  getAllUsers: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        role: z.enum(["admin", "user"]).optional(),
        sortBy: z.enum(["createdAt", "lastSignedIn", "email"]).default("createdAt"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
      })
    )
    .query(async ({ input }) => {
      try {
        const { getDb } = await import("../db");
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const { users } = await import("../../drizzle/schema");
        const { eq, like, desc, asc, and } = await import("drizzle-orm");

        // Build where clause
        const whereConditions = [];
        
        if (input.search) {
          whereConditions.push(
            like(users.email, `%${input.search}%`)
          );
        }
        
        if (input.role) {
          whereConditions.push(eq(users.role, input.role));
        }

        // Build query
        let query = db.select().from(users) as any;

        if (whereConditions.length > 0) {
          query = query.where(and(...whereConditions));
        }

        // Sort
        const sortColumn = input.sortBy === "createdAt" ? users.createdAt 
          : input.sortBy === "lastSignedIn" ? users.lastSignedIn 
          : users.email;
        
        const sortFn = input.sortOrder === "desc" ? desc : asc;
        query = query.orderBy(sortFn(sortColumn));

        // Paginate
        const offset = (input.page - 1) * input.limit;
        const data = await query.limit(input.limit).offset(offset);

        // Get total count
        const countQuery = db.select().from(users) as any;
        const countResult = await countQuery;
        const total = countResult.length;

        return {
          data,
          pagination: {
            page: input.page,
            limit: input.limit,
            total,
            pages: Math.ceil(total / input.limit),
          },
        };
      } catch (error) {
        console.error("Error fetching users:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch users",
        });
      }
    }),

  // Get user statistics
  getUserStats: adminProcedure.query(async () => {
    try {
      const { getDb } = await import("../db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { users } = await import("../../drizzle/schema");

      const allUsers = await db.select().from(users);

      const totalUsers = allUsers.length;
      const adminCount = allUsers.filter((u) => u.role === "admin").length;
      const userCount = allUsers.filter((u) => u.role === "user").length;

      // Calculate active users (signed in last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const activeUsers = allUsers.filter((u) => {
        const lastSignedIn = new Date(u.lastSignedIn || 0);
        return lastSignedIn > thirtyDaysAgo;
      }).length;

      // Calculate new users (created in last 30 days)
      const newUsers = allUsers.filter((u) => {
        const createdAt = new Date(u.createdAt || 0);
        return createdAt > thirtyDaysAgo;
      }).length;

      return {
        totalUsers,
        adminCount,
        userCount,
        activeUsers,
        newUsers,
        activePercentage: totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0,
      };
    } catch (error) {
      console.error("Error fetching user stats:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch user statistics",
      });
    }
  }),

  // Get single user details
  getUserDetails: adminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      try {
        const { getDb } = await import("../db");
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const { users } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");

        const user = await db
          .select()
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1);

        if (!user || user.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        return user[0];
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("Error fetching user details:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch user details",
        });
      }
    }),

  // Get user activity log
  getUserActivity: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) => {
      try {
        // Mock activity data - in production, this would come from an activity log table
        const mockActivities = [
          {
            id: "1",
            userId: input.userId,
            type: "login",
            description: "Logged in successfully",
            timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000),
            ipAddress: "192.168.1.1",
            success: true,
          },
          {
            id: "2",
            userId: input.userId,
            type: "view",
            description: "Viewed dashboard",
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
            ipAddress: "192.168.1.1",
            success: true,
          },
          {
            id: "3",
            userId: input.userId,
            type: "edit",
            description: "Updated profile",
            timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
            ipAddress: "192.168.1.1",
            success: true,
          },
          {
            id: "4",
            userId: input.userId,
            type: "login",
            description: "Login attempt failed",
            timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
            ipAddress: "192.168.1.2",
            success: false,
          },
          {
            id: "5",
            userId: input.userId,
            type: "logout",
            description: "Logged out",
            timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000),
            ipAddress: "192.168.1.1",
            success: true,
          },
        ];

        const offset = (input.page - 1) * input.limit;
        const data = mockActivities.slice(offset, offset + input.limit);
        const total = mockActivities.length;

        return {
          data,
          pagination: {
            page: input.page,
            limit: input.limit,
            total,
            pages: Math.ceil(total / input.limit),
          },
        };
      } catch (error) {
        console.error("Error fetching user activity:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch user activity",
        });
      }
    }),

  // Update user role
  updateUserRole: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        role: z.enum(["admin", "user"]),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const { getDb } = await import("../db");
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const { users } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");

        await db
          .update(users)
          .set({ role: input.role, updatedAt: new Date() })
          .where(eq(users.id, input.userId));

        return { success: true };
      } catch (error) {
        console.error("Error updating user role:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update user role",
        });
      }
    }),

  // Delete user
  deleteUser: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      try {
        const { getDb } = await import("../db");
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const { users } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");

        await db.delete(users).where(eq(users.id, input.userId));

        return { success: true };
      } catch (error) {
        console.error("Error deleting user:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete user",
        });
      }
    }),
});
