import { NextAuthOptions } from "next-auth";
import type { AdapterAccount } from "next-auth/adapters";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

const adapter = PrismaAdapter(prisma);

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || null;
}

function scopeHas(scope: string | null | undefined, value: string) {
  return Boolean(scope?.split(/\s+/).includes(value));
}

function mergeScopes(...scopes: Array<string | null | undefined>) {
  return Array.from(new Set(scopes.flatMap((scope) => scope?.split(/\s+/).filter(Boolean) ?? []))).join(" ");
}

export async function requireCurrentUser() {
  const { getServerSession } = await import("next-auth");
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, image: true },
  });
  return user;
}

export function isAdminEmail(email?: string | null) {
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email && admins.includes(email.toLowerCase()));
}

export async function requireAdminUser() {
  const user = await requireCurrentUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

export const authOptions: NextAuthOptions = {
  adapter: {
    ...adapter,
    async linkAccount(account: AdapterAccount) {
      const existingAccount = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
        },
      });

      if (existingAccount) {
        await prisma.account.update({
          where: { id: existingAccount.id },
          data: {
            userId: account.userId,
            type: account.type,
            refresh_token: account.refresh_token ?? existingAccount.refresh_token,
            access_token: account.access_token ?? existingAccount.access_token,
            expires_at: account.expires_at ?? existingAccount.expires_at,
            token_type: account.token_type ?? existingAccount.token_type,
            scope: mergeScopes(existingAccount.scope, account.scope),
            id_token: account.id_token ?? existingAccount.id_token,
            session_state:
              typeof account.session_state === "string" ? account.session_state : existingAccount.session_state,
          },
        });
        return;
      }

      await prisma.account.create({
        data: {
          userId: account.userId,
          type: account.type,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          refresh_token: account.refresh_token,
          access_token: account.access_token,
          expires_at: account.expires_at,
          token_type: account.token_type,
          scope: account.scope,
          id_token: account.id_token,
          session_state: typeof account.session_state === "string" ? account.session_state : null,
        },
      });
    },
  },
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
            authorization: {
              params: {
                scope: "openid email profile",
                access_type: "offline",
                prompt: "consent",
              },
            },
          }),
        ]
      : []),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.trim().toLowerCase() },
        });
        if (!user?.password) return null;
        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  jwt: {
    maxAge: 60 * 60 * 24 * 30,
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google" || !account.providerAccountId) {
        return true;
      }

      const email = normalizeEmail(user.email ?? (profile as { email?: string | null })?.email);
      console.info("Google sign-in callback", {
        email,
        providerAccountId: account.providerAccountId,
        scope: account.scope,
        userId: user.id,
      });
      if (!email) return true;

      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (!existingUser) return true;
      console.info("Google same-email user found", { existingUserId: existingUser.id, email });

      const existingAccount = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
        },
        select: { id: true, scope: true, refresh_token: true, access_token: true },
      });

      const incomingScope = account.scope ?? "";
      const existingScope = existingAccount?.scope ?? "";
      const incomingHasYouTube = scopeHas(incomingScope, "https://www.googleapis.com/auth/youtube.readonly");
      const existingHasYouTube = scopeHas(existingScope, "https://www.googleapis.com/auth/youtube.readonly");

      if (existingAccount) {
        await prisma.account.update({
          where: { id: existingAccount.id },
          data: {
            refresh_token: account.refresh_token ?? existingAccount.refresh_token,
            access_token: incomingHasYouTube || !existingHasYouTube ? account.access_token ?? existingAccount.access_token : existingAccount.access_token,
            expires_at: incomingHasYouTube || !existingHasYouTube ? account.expires_at : undefined,
            token_type: account.token_type,
            scope: mergeScopes(existingScope, incomingScope),
            id_token: account.id_token,
            session_state: typeof account.session_state === "string" ? account.session_state : undefined,
          },
        });
      } else {
        try {
          await prisma.account.create({
            data: {
              userId: existingUser.id,
              type: account.type ?? "oauth",
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              refresh_token: account.refresh_token,
              access_token: account.access_token,
              expires_at: account.expires_at,
              token_type: account.token_type,
              scope: account.scope,
              id_token: account.id_token,
              session_state:
                typeof account.session_state === "string" ? account.session_state : null,
            },
          });
        } catch (error) {
          console.error("Google account auto-link failed", error);
        }
      }

      user.id = existingUser.id;
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        (session.user as any).id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
