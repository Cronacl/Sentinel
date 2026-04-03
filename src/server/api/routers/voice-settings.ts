import { eq } from "drizzle-orm";

import {
  deriveVoiceInputAvailability,
  normalizeVoiceInputSettings,
  type TranscriptionProviderId,
  type VoiceProviderStatus,
} from "@/lib/ai/providers/transcription";
import { voiceSettingsFormSchema } from "@/schemas/voice-settings.schema";
import { providerCredentials, users } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

function mapProviderStatuses(
  credentials: Array<{
    isEnabled: boolean;
    provider: string;
  }>,
) {
  return credentials.reduce(
    (result, credential) => {
      result[credential.provider as TranscriptionProviderId] =
        credential.isEnabled ? "active" : "disabled";
      return result;
    },
    {} as Partial<Record<TranscriptionProviderId, VoiceProviderStatus>>,
  );
}

async function readVoiceSettings(input: {
  db: any;
  userId: string;
  userSettings?: {
    voiceInputEnabled?: boolean | null;
    voiceInputModelId?: string | null;
    voiceInputProvider?: string | null;
  };
}) {
  const storedSettings =
    input.userSettings ??
    (await input.db.query.users.findFirst({
      columns: {
        voiceInputEnabled: true,
        voiceInputModelId: true,
        voiceInputProvider: true,
      },
      where: eq(users.id, input.userId),
    }));

  const credentials = await input.db.query.providerCredentials.findMany({
    columns: {
      isEnabled: true,
      provider: true,
    },
    where: eq(providerCredentials.userId, input.userId),
  });

  const providerStatuses = mapProviderStatuses(credentials);
  const settings = normalizeVoiceInputSettings(storedSettings ?? {});
  const availability = deriveVoiceInputAvailability({
    providerStatuses,
    settings,
  });

  return {
    ...settings,
    isAvailable: availability.isAvailable,
    providers: availability.providers,
    resolvedModelId: availability.resolvedModelId,
    unavailableReason: availability.unavailableReason,
  };
}

export const voiceSettingsRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    return readVoiceSettings({
      db: ctx.db,
      userId: ctx.session.user.id,
      userSettings: ctx.user,
    });
  }),

  update: protectedProcedure
    .input(voiceSettingsFormSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.db
        .update(users)
        .set({
          voiceInputEnabled: input.voiceInputEnabled,
          voiceInputModelId: input.voiceInputModelId,
          voiceInputProvider: input.voiceInputProvider,
        })
        .where(eq(users.id, ctx.session.user.id))
        .run();

      return readVoiceSettings({
        db: ctx.db,
        userId: ctx.session.user.id,
        userSettings: input,
      });
    }),
});
