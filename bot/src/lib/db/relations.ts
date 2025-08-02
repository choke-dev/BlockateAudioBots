import { relations } from "drizzle-orm/relations";
import { users, sessions, oauthTokens, whitelistRequests } from "./schema";

export const sessionsRelations = relations(sessions, ({one}) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	sessions: many(sessions),
	oauthTokens: many(oauthTokens),
	whitelistRequests: many(whitelistRequests),
}));

export const oauthTokensRelations = relations(oauthTokens, ({one}) => ({
	user: one(users, {
		fields: [oauthTokens.userId],
		references: [users.id]
	}),
}));

export const whitelistRequestsRelations = relations(whitelistRequests, ({one}) => ({
	user: one(users, {
		fields: [whitelistRequests.userId],
		references: [users.id]
	}),
}));