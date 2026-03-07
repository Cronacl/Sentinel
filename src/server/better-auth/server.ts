import { cache } from "react";

import { getLocalSession } from "@/server/local-profile";

export const getSession = cache(async () => getLocalSession());
