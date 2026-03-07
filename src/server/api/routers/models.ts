import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { AIProvider } from "@/../generated/prisma";
import {
	MODEL_CATALOG,
	getModelsForProvider,
	isKnownModel,
} from "@/lib/ai/models";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

const aiProviderEnum = z.enum(["openai", "anthropic", "google"]);

export const modelsRouter = createTRPCRouter({
	list: protectedProcedure
		.input(
			z
				.object({
					provider: aiProviderEnum.optional(),
				})
				.optional(),
		)
		.query(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;

			const connectedProviders = await ctx.db.providerCredential.findMany({
				where: { userId, isEnabled: true },
				select: { provider: true },
			});

			const connectedSet = new Set(connectedProviders.map((p) => p.provider));

			const preferences = await ctx.db.modelPreference.findMany({
				where: { userId },
			});

			const prefMap = new Map(
				preferences.map((p) => [`${p.provider}:${p.modelId}`, p]),
			);

			const targetProviders = input?.provider
				? [input.provider as AIProvider]
				: (Object.keys(MODEL_CATALOG) as AIProvider[]);

			const models = targetProviders.flatMap((provider) => {
				const builtIn = getModelsForProvider(provider).map((model) => {
					const pref = prefMap.get(`${provider}:${model.id}`);
					return {
						provider,
						modelId: model.id,
						displayName: model.displayName,
						description: model.description,
						capabilities: model.capabilities,
						contextWindow: model.contextWindow,
						isCustom: false,
						isEnabled: pref?.isEnabled ?? true,
						isConnected: connectedSet.has(provider),
					};
				});

				const customModels = preferences
					.filter(
						(p) =>
							p.provider === provider &&
							p.isCustom &&
							!isKnownModel(provider, p.modelId),
					)
					.map((p) => ({
						provider: p.provider,
						modelId: p.modelId,
						displayName: p.modelId,
						description: "Custom model",
						capabilities: [] as string[],
						contextWindow: undefined as number | undefined,
						isCustom: true,
						isEnabled: p.isEnabled,
						isConnected: connectedSet.has(provider),
					}));

				return [...builtIn, ...customModels];
			});

			return models;
		}),

	enable: protectedProcedure
		.input(
			z.object({
				provider: aiProviderEnum,
				modelId: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			return ctx.db.modelPreference.upsert({
				where: {
					userId_provider_modelId: {
						userId: ctx.session.user.id,
						provider: input.provider,
						modelId: input.modelId,
					},
				},
				create: {
					userId: ctx.session.user.id,
					provider: input.provider,
					modelId: input.modelId,
					isEnabled: true,
				},
				update: { isEnabled: true },
				select: { provider: true, modelId: true, isEnabled: true },
			});
		}),

	disable: protectedProcedure
		.input(
			z.object({
				provider: aiProviderEnum,
				modelId: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			return ctx.db.modelPreference.upsert({
				where: {
					userId_provider_modelId: {
						userId: ctx.session.user.id,
						provider: input.provider,
						modelId: input.modelId,
					},
				},
				create: {
					userId: ctx.session.user.id,
					provider: input.provider,
					modelId: input.modelId,
					isEnabled: false,
				},
				update: { isEnabled: false },
				select: { provider: true, modelId: true, isEnabled: true },
			});
		}),

	addCustom: protectedProcedure
		.input(
			z.object({
				provider: aiProviderEnum,
				modelId: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;

			const credential = await ctx.db.providerCredential.findUnique({
				where: {
					userId_provider: { userId, provider: input.provider },
				},
				select: { isEnabled: true },
			});

			if (!credential?.isEnabled) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: `Provider "${input.provider}" must be connected and enabled to add custom models.`,
				});
			}

			return ctx.db.modelPreference.create({
				data: {
					userId,
					provider: input.provider,
					modelId: input.modelId,
					isCustom: true,
					isEnabled: true,
				},
				select: {
					provider: true,
					modelId: true,
					isCustom: true,
					isEnabled: true,
				},
			});
		}),

	removeCustom: protectedProcedure
		.input(
			z.object({
				provider: aiProviderEnum,
				modelId: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const pref = await ctx.db.modelPreference.findUnique({
				where: {
					userId_provider_modelId: {
						userId: ctx.session.user.id,
						provider: input.provider,
						modelId: input.modelId,
					},
				},
				select: { isCustom: true },
			});

			if (!pref?.isCustom) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Only custom models can be removed.",
				});
			}

			return ctx.db.modelPreference.delete({
				where: {
					userId_provider_modelId: {
						userId: ctx.session.user.id,
						provider: input.provider,
						modelId: input.modelId,
					},
				},
			});
		}),
});
