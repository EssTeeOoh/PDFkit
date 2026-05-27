import { fireEvent, screen, waitFor } from "@testing-library/react";
import MergeTool from "./MergeTool";
import { makePdfFile, renderWithProviders } from "../../testUtils";
import { post } from "../../utils/http";

jest.mock("../../utils/http", () => ({
  __esModule: true,
  post: jest.fn(),
}));

jest.mock("../../utils/haptics", () => ({
  hapticTap: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticError: jest.fn(),
}));

jest.mock("../../utils/telemetry", () => ({
  reportFrontendError: jest.fn(),
  trackToolAction: jest.fn(),
}));

describe("MergeTool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uploads PDFs and posts them to the merge endpoint", async () => {
    post.mockResolvedValue({
      data: new Blob(["merged"], { type: "application/pdf" }),
      headers: { "content-disposition": 'attachment; filename="merged.pdf"' },
    });

    const { container } = renderWithProviders(<MergeTool />);
    const input = container.querySelector('input[type="file"]');

    fireEvent.change(input, {
      target: { files: [makePdfFile("one.pdf"), makePdfFile("two.pdf")] },
    });

    fireEvent.click(screen.getByRole("button", { name: /merge 2 pdfs/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "http://localhost:8000/api/merge",
        expect.any(FormData),
        expect.objectContaining({ responseType: "blob" })
      )
    );

    expect((await screen.findAllByText(/merged successfully/i)).length).toBeGreaterThan(0);
  });
});
