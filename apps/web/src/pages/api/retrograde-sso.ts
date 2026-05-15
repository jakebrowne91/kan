import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { and, eq, isNull, or } from "drizzle-orm";

import { initAuth } from "@kan/auth/server";
import { createDrizzleClient } from "@kan/db/client";
import * as boardRepo from "@kan/db/repository/board.repo";
import * as listRepo from "@kan/db/repository/list.repo";
import * as memberRepo from "@kan/db/repository/member.repo";
import * as permissionRepo from "@kan/db/repository/permission.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import {
  boards,
  lists,
  users,
  workspaceMembers,
  workspaces,
} from "@kan/db/schema";

import { env } from "~/env";

const ISSUER = "retrograde-admin";
const AUDIENCE = "kan-retrograde-support";
const DEFAULT_WORKSPACE_SLUG = "retrograde-support";
const DEFAULT_WORKSPACE_NAME = "Creator Compute Company Support";
const DEFAULT_BOARD_SLUG = "customer-support";
const DEFAULT_BOARD_NAME = "Customer Support";
const DEFAULT_LIST_NAMES = [
  "New",
  "Investigating",
  "Bug Raised",
  "Ready for Review",
  "Resolved",
];
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const db = createDrizzleClient();
const auth = initAuth(db);

interface SsoPayload {
  iss: string;
  aud: string;
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

interface KanUser {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
}

interface WorkspaceRecord {
  id: number;
  publicId: string;
  name: string;
  slug: string;
}

interface BoardRecord {
  id: number;
  publicId: string;
  name: string;
  slug: string;
}

function getStringQueryParam(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;

  const normalized = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function decodeJsonSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

function verifyJwt(token: string, secret: string): SsoPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) return null;

  try {
    const expectedSignature = createHmac("sha256", secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest();
    const actualSignature = Buffer.from(encodedSignature, "base64url");

    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) {
      return null;
    }

    const header = decodeJsonSegment(encodedHeader);
    if (
      !header ||
      typeof header !== "object" ||
      (header as Record<string, unknown>).alg !== "HS256"
    ) {
      return null;
    }

    const payload = decodeJsonSegment(encodedPayload);
    if (!payload || typeof payload !== "object") return null;

    const record = payload as Record<string, unknown>;
    const email = normalizeEmail(record.email);
    const now = Math.floor(Date.now() / 1000);

    if (
      record.iss !== ISSUER ||
      record.aud !== AUDIENCE ||
      !email ||
      record.sub !== email ||
      typeof record.iat !== "number" ||
      typeof record.exp !== "number" ||
      record.iat > now + 60 ||
      record.exp <= now
    ) {
      return null;
    }

    return {
      iss: ISSUER,
      aud: AUDIENCE,
      sub: email,
      email,
      iat: record.iat,
      exp: record.exp,
    };
  } catch {
    return null;
  }
}

function getDisplayName(email: string): string {
  const localPart = email.split("@")[0];
  const displayPart = localPart && localPart.length > 0 ? localPart : email;
  const words = displayPart
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean);

  return words.length
    ? words
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    : email;
}

async function findUserByEmail(email: string): Promise<KanUser | null> {
  const user = await db.query.users.findFirst({
    columns: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
    },
    where: eq(users.email, email),
  });

  return user ?? null;
}

async function ensureUser(email: string): Promise<KanUser> {
  const existingUser = await findUserByEmail(email);
  if (existingUser) return existingUser;

  const [createdUser] = await db
    .insert(users)
    .values({
      email,
      name: getDisplayName(email),
      emailVerified: true,
    })
    .onConflictDoNothing()
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      emailVerified: users.emailVerified,
    });

  const user = createdUser ?? (await findUserByEmail(email));
  if (!user) throw new Error(`Failed to create Retrograde SSO user ${email}`);

  return user;
}

async function findWorkspaceBySlug(
  slug: string,
): Promise<WorkspaceRecord | null> {
  const workspace = await db.query.workspaces.findFirst({
    columns: {
      id: true,
      publicId: true,
      name: true,
      slug: true,
    },
    where: and(eq(workspaces.slug, slug), isNull(workspaces.deletedAt)),
  });

  return workspace ?? null;
}

async function ensureWorkspace(user: KanUser): Promise<WorkspaceRecord> {
  const slug = env.RETROGRADE_SUPPORT_WORKSPACE_SLUG ?? DEFAULT_WORKSPACE_SLUG;
  const name = env.RETROGRADE_SUPPORT_WORKSPACE_NAME ?? DEFAULT_WORKSPACE_NAME;

  const existingWorkspace = await findWorkspaceBySlug(slug);
  if (existingWorkspace) return existingWorkspace;

  await workspaceRepo
    .create(db, {
      name,
      slug,
      createdBy: user.id,
      createdByEmail: user.email,
      description: "Retrograde customer support workspace",
      plan: "team",
    })
    .catch(async (error) => {
      const workspace = await findWorkspaceBySlug(slug);
      if (workspace) return;
      throw error;
    });

  const workspace = await findWorkspaceBySlug(slug);
  if (!workspace) throw new Error(`Failed to create workspace ${slug}`);

  return workspace;
}

async function findBoardBySlug(
  workspaceId: number,
  slug: string,
): Promise<BoardRecord | null> {
  const board = await db.query.boards.findFirst({
    columns: {
      id: true,
      publicId: true,
      name: true,
      slug: true,
    },
    where: and(
      eq(boards.workspaceId, workspaceId),
      eq(boards.slug, slug),
      isNull(boards.deletedAt),
    ),
  });

  return board ?? null;
}

async function ensureBoard(
  user: KanUser,
  workspace: WorkspaceRecord,
): Promise<BoardRecord> {
  const slug = env.RETROGRADE_SUPPORT_BOARD_SLUG ?? DEFAULT_BOARD_SLUG;
  const name = env.RETROGRADE_SUPPORT_BOARD_NAME ?? DEFAULT_BOARD_NAME;

  const existingBoard = await findBoardBySlug(workspace.id, slug);
  if (existingBoard) return existingBoard;

  await boardRepo
    .create(db, {
      name,
      slug,
      createdBy: user.id,
      workspaceId: workspace.id,
    })
    .catch(async (error) => {
      const board = await findBoardBySlug(workspace.id, slug);
      if (board) return;
      throw error;
    });

  const board = await findBoardBySlug(workspace.id, slug);
  if (!board) throw new Error(`Failed to create board ${slug}`);

  return board;
}

async function ensureLists(user: KanUser, board: BoardRecord) {
  const existingLists = await db.query.lists.findMany({
    columns: {
      name: true,
    },
    where: and(eq(lists.boardId, board.id), isNull(lists.deletedAt)),
  });
  const existingNames = new Set(existingLists.map((list) => list.name));

  for (const name of DEFAULT_LIST_NAMES) {
    if (!existingNames.has(name)) {
      await listRepo.create(db, {
        name,
        createdBy: user.id,
        boardId: board.id,
      });
    }
  }
}

async function ensureWorkspaceMembership(
  user: KanUser,
  workspace: WorkspaceRecord,
) {
  const adminRole = await permissionRepo.getRoleByWorkspaceIdAndName(
    db,
    workspace.id,
    "admin",
  );
  const existingMember = await db.query.workspaceMembers.findFirst({
    columns: {
      id: true,
      status: true,
      userId: true,
      role: true,
      roleId: true,
    },
    where: and(
      eq(workspaceMembers.workspaceId, workspace.id),
      isNull(workspaceMembers.deletedAt),
      or(
        eq(workspaceMembers.email, user.email),
        eq(workspaceMembers.userId, user.id),
      ),
    ),
  });

  if (existingMember) {
    if (
      existingMember.status !== "active" ||
      existingMember.userId !== user.id ||
      existingMember.role !== "admin" ||
      existingMember.roleId !== (adminRole?.id ?? null)
    ) {
      await db
        .update(workspaceMembers)
        .set({
          userId: user.id,
          email: user.email,
          role: "admin",
          roleId: adminRole?.id ?? null,
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(workspaceMembers.id, existingMember.id));
    }

    return;
  }

  await memberRepo.create(db, {
    userId: user.id,
    email: user.email,
    workspaceId: workspace.id,
    createdBy: user.id,
    role: "admin",
    roleId: adminRole?.id ?? null,
    status: "active",
  });
}

function signBetterAuthCookieValue(
  value: string,
  secret: string | Uint8Array,
): string {
  const key = typeof secret === "string" ? secret : Buffer.from(secret);
  const signature = createHmac("sha256", key).update(value).digest("base64");

  return encodeURIComponent(`${value}.${signature}`);
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    maxAge?: number;
    domain?: string;
    path?: string;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
    partitioned?: boolean;
  },
) {
  const parts = [`${name}=${value}`];

  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  }
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) {
    parts.push(
      `SameSite=${options.sameSite.charAt(0).toUpperCase()}${options.sameSite.slice(1)}`,
    );
  }
  if (options.partitioned) parts.push("Partitioned");

  return parts.join("; ");
}

function serializeExpiredSessionCookie(
  name: string,
  options: {
    domain?: string;
    path?: string;
    secure?: boolean;
    sameSite?: string;
    partitioned?: boolean;
  },
) {
  return serializeCookie(name, "", {
    ...options,
    maxAge: 0,
    expires: new Date(0),
    httpOnly: true,
  });
}

function isSecureRequest(req: NextApiRequest): boolean {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto;

  if (protocol?.split(",")[0]?.trim() === "https") return true;

  const host = req.headers.host ?? "";
  return !host.startsWith("localhost:") && !host.startsWith("127.0.0.1:");
}

function getClientIp(req: NextApiRequest): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const forwardedIp = ip?.split(",")[0]?.trim();

  return forwardedIp ?? req.socket.remoteAddress ?? "";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const secret = env.RETROGRADE_GSD_SSO_SECRET;
  if (!secret) {
    res.status(500).json({ error: "Retrograde GSD SSO is not configured" });
    return;
  }

  const token = getStringQueryParam(req.query.token);
  const payload = token ? verifyJwt(token, secret) : null;

  if (!payload) {
    res.status(401).json({ error: "Invalid or expired SSO token" });
    return;
  }

  try {
    const user = await ensureUser(payload.email);
    const workspace = await ensureWorkspace(user);
    const board = await ensureBoard(user, workspace);

    await ensureLists(user, board);
    await ensureWorkspaceMembership(user, workspace);

    const authContext = await auth.$context;
    const session = (await authContext.internalAdapter.createSession(
      user.id,
      false,
      {
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] ?? "",
      },
    )) as { token: string } | null;

    if (!session) {
      throw new Error(`Failed to create SSO session for ${user.email}`);
    }

    const cookie = authContext.authCookies.sessionToken;
    const cookieValue = signBetterAuthCookieValue(
      session.token,
      authContext.secret,
    );
    const secureRequest = isSecureRequest(req);
    const setCookie = serializeCookie(cookie.name, cookieValue, {
      ...cookie.options,
      maxAge: cookie.options.maxAge ?? SESSION_MAX_AGE_SECONDS,
      secure: secureRequest,
      sameSite: secureRequest ? "none" : "lax",
      partitioned: secureRequest,
    });

    const cookiePath = cookie.options.path ?? "/";
    const clearBaseCookie = serializeExpiredSessionCookie(cookie.name, {
      domain: cookie.options.domain,
      path: cookiePath,
      secure: secureRequest,
      sameSite: secureRequest ? "none" : "lax",
    });
    const clearPartitionedCookie = secureRequest
      ? serializeExpiredSessionCookie(cookie.name, {
          domain: cookie.options.domain,
          path: cookiePath,
          secure: true,
          sameSite: "none",
          partitioned: true,
        })
      : null;

    const sessionCookies = [
      clearBaseCookie,
      clearPartitionedCookie,
      setCookie,
    ].filter((cookieHeader): cookieHeader is string => Boolean(cookieHeader));

    res.setHeader("Set-Cookie", sessionCookies);
    res.redirect(302, `/boards/${board.publicId}`);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to start Retrograde GSD session" });
  }
}
