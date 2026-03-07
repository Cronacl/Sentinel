import { z } from "zod";

export const passkeyFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Passkey name is required.")
    .max(60, "Passkey name must be 60 characters or fewer."),
});

export type PasskeyFormValues = z.infer<typeof passkeyFormSchema>;
