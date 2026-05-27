import { getFriendlyApiError } from "./apiErrors";

describe("getFriendlyApiError", () => {
  it("returns a friendly fallback for unexpected technical errors", async () => {
    const message = await getFriendlyApiError(
      new Error("post is not a function"),
      "We couldn't process that file. Please try again."
    );

    expect(message).toBe("We couldn't process that file. Please try again.");
  });

  it("keeps safe backend validation messages", async () => {
    const message = await getFriendlyApiError(
      {
        response: {
          data: { detail: "File must be a PDF." },
        },
      },
      "We couldn't process that file. Please try again."
    );

    expect(message).toBe("File must be a PDF.");
  });
});
