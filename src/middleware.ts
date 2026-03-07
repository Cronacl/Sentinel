import {
  AppRules,
  MiddlewareBuilder,
  createFetchUser,
} from "@/lib/auth/middleware";
import type { MiddlewareUser } from "@/lib/auth/share-types";

const middleware = new MiddlewareBuilder<MiddlewareUser>({
  fetchUser: createFetchUser(),
})
  .exact("/login", AppRules.isNotLoggedIn())
  .exact("/signup", AppRules.isNotLoggedIn())
  .exact("/", AppRules.isLoggedIn())
  .build();

export default middleware;

export const config = {
  matcher: ["/((?!api/|_next/|_proxy/|_static|_vercel|[\\w-]+\\.\\w+).*)"],
};
