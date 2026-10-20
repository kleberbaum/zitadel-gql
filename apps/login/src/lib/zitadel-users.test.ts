import { TextQueryMethod } from "@zitadel/proto/zitadel/object/v2/object_pb";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createServiceForHost } from "./service";
import { listUsersByLoginNameOrEmail } from "./zitadel";

vi.mock("./service", () => ({
  createServiceForHost: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => (key: string) => key),
}));

describe("listUsersByLoginNameOrEmail", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("asks for a login name or an email address equal to the address, without case and in every organization", async () => {
    const listUsers = vi.fn().mockResolvedValue({ result: [] });
    vi.mocked(createServiceForHost).mockResolvedValue({ listUsers } as any);

    await listUsersByLoginNameOrEmail({ serviceConfig: { baseUrl: "https://zitadel.test" }, address: "person@example.com" });

    expect(listUsers).toHaveBeenCalledTimes(1);
    const { query, queries } = listUsers.mock.calls[0][0];
    expect(query).toEqual({ limit: 2 });
    expect(queries).toHaveLength(1);
    expect(queries[0].query.case).toBe("orQuery");

    const alternatives = queries[0].query.value.queries.map((q: any) => q.query);
    expect(alternatives).toEqual([
      expect.objectContaining({
        case: "loginNameQuery",
        value: expect.objectContaining({ loginName: "person@example.com", method: TextQueryMethod.EQUALS_IGNORE_CASE }),
      }),
      expect.objectContaining({
        case: "emailQuery",
        value: expect.objectContaining({ emailAddress: "person@example.com", method: TextQueryMethod.EQUALS_IGNORE_CASE }),
      }),
    ]);
  });
});
