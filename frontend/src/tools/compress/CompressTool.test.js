import { fireEvent, screen, waitFor } from "@testing-library/react";
import CompressTool from "./CompressTool";
import { makePdfFile, renderWithProviders } from "../../testUtils";
import { get, post } from "../../utils/http";

jest.mock("../../utils/http", () => ({
  __esModule: true,
  post: jest.fn(),
  get: jest.fn(),
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

describe("CompressTool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a compression job, polls it, and downloads the result", async () => {
    post.mockResolvedValue({
      data: { job_id: "job-123" },
    });
    get
      .mockResolvedValueOnce({
        data: { status: "done", progress: 100, stage: "Ready to download" },
      })
      .mockResolvedValueOnce({
        data: new Blob(["pdf"], { type: "application/pdf" }),
        headers: { "content-disposition": 'attachment; filename="compressed.pdf"' },
      });

    const { container } = renderWithProviders(<CompressTool />);
    const input = container.querySelector('input[type="file"]');

    fireEvent.change(input, {
      target: { files: [makePdfFile("big.pdf")] },
    });

    fireEvent.click(screen.getByRole("button", { name: /compress pdf/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "http://localhost:8000/api/compress/jobs",
        expect.any(FormData),
        expect.any(Object)
      )
    );

    await waitFor(() =>
      expect(get).toHaveBeenNthCalledWith(
        1,
        "http://localhost:8000/api/compress/jobs/job-123"
      )
    );

    expect(await screen.findByText(/compression complete/i)).toBeInTheDocument();
  });
});
