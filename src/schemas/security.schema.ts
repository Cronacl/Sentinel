import { z } from "zod";

import { PERMISSION_MODE_VALUES } from "@/lib/security";

export const permissionModeSchema = z.enum(PERMISSION_MODE_VALUES);

export const securitySettingsFormSchema = z.object({
  permissionMode: permissionModeSchema,
});

export type SecuritySettingsFormValues = z.infer<
  typeof securitySettingsFormSchema
>;
