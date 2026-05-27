import { fireEvent, screen, waitFor } from "@testing-library/react";
import SplitTool from "./SplitTool";
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

describe("SplitTool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("submits custom ranges to the split endpoint", async () => {
    post.mockResolvedValue({
      data: new Blob(["zip"], { type: "application/zip" }),
      headers: { "content-disposition": 'attachment; filename="split.zip"' },
    });

    const { container } = renderWithProviders(<SplitTool />);
    const input = container.querySelector('input[type="file"]');

    fireEvent.change(input, {
      target: { files: [makePdfFile("ranges.pdf")] },
    });

    fireEvent.click(screen.getByRole("button", { name: /custom ranges/i }));
    fireEvent.change(screen.getByPlaceholderText(/1-3, 5, 7-10/i), {
      target: { value: "1-2,4" },
    });
    fireEvent.click(screen.getByRole("button", { name: /split pdf/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "http://localhost:8000/api/split",
        expect.any(FormData),
        expect.objectContaining({ responseType: "blob" })
      )
    );

    expect((await screen.findAllByText(/split complete/i)).length).toBeGreaterThan(0);
  });
});
