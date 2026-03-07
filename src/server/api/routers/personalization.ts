import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { personalizationFormSchema } from "@/schemas/personalization.schema";

export const personalizationRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        aboutUser: true,
        customInstructions: true,
        nickname: true,
        occupation: true,
        personalityPreset: true,
      },
    });

    return {
      aboutUser: user?.aboutUser ?? "",
      customInstructions: user?.customInstructions ?? "",
      nickname: user?.nickname ?? "",
      occupation: user?.occupation ?? "",
      personality: user?.personalityPreset ?? "pragmatic",
    };
  }),

  upsert: protectedProcedure
    .input(personalizationFormSchema)
    .mutation(async ({ ctx, input }) => {
      const data = {
        aboutUser: input.aboutUser.trim() || null,
        customInstructions: input.customInstructions.trim() || null,
        nickname: input.nickname.trim() || null,
        occupation: input.occupation.trim() || null,
        personalityPreset: input.personality,
      };

      const user = await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data,
        select: {
          aboutUser: true,
          customInstructions: true,
          nickname: true,
          occupation: true,
          personalityPreset: true,
        },
      });

      return {
        aboutUser: user.aboutUser ?? "",
        customInstructions: user.customInstructions ?? "",
        nickname: user.nickname ?? "",
        occupation: user.occupation ?? "",
        personality: user.personalityPreset,
      };
    }),
});
