import { describe, expect, it } from "bun:test";

import {
  buildManagedExecutablePathValue,
  buildPreferredExecutablePathValue,
  getPlatformHomeDirectory,
} from "./platform-paths";

describe("platform path helpers", () => {
  it("derives Windows home directories from USERPROFILE", () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      USERPROFILE: "C:\\Users\\sentinel",
    };

    expect(
      getPlatformHomeDirectory({
        env,
        platform: "win32",
      }),
    ).toBe("C:\\Users\\sentinel");
  });

  it("adds common Windows runtime paths to executable lookup", () => {
    const env: NodeJS.ProcessEnv = {
      APPDATA: "C:\\Users\\sentinel\\AppData\\Roaming",
      LOCALAPPDATA: "C:\\Users\\sentinel\\AppData\\Local",
      NODE_ENV: "test",
      ProgramFiles: "C:\\Program Files",
      USERPROFILE: "C:\\Users\\sentinel",
    };

    const preferred = buildPreferredExecutablePathValue(
      "C:\\Windows\\System32",
      {
        env,
        platform: "win32",
      },
    );

    expect(preferred).toContain("C:\\Users\\sentinel\\.bun\\bin");
    expect(preferred).toContain("C:\\Users\\sentinel\\AppData\\Roaming\\npm");
    expect(preferred).toContain(
      "C:\\Users\\sentinel\\AppData\\Local\\Volta\\bin",
    );
  });

  it("keeps Linux path recovery for managed shells", async () => {
    const env: NodeJS.ProcessEnv = {
      HOME: "/home/sentinel",
      NODE_ENV: "test",
    };

    const preferred = await buildManagedExecutablePathValue("/usr/bin:/bin", {
      env,
      platform: "linux",
    });

    expect(preferred).toContain("/home/sentinel/.bun/bin");
    expect(preferred).toContain("/usr/bin");
  });
});
